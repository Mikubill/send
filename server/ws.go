package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"github.com/gorilla/websocket"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

var fileMap = NewCMap()

const (
	b           = 1
	kilobyte    = 1024 * b
	megabyte    = 1024 * kilobyte
	gigabyte    = 1024 * megabyte
	uploadLimit = 10 * gigabyte
)

type wsClient struct {
	init    bool
	conn    *websocket.Conn
	channel *chanSet
}

type chanSet struct {
	close chan struct{}
	write chan []byte
	read  chan []byte
	file  wsData
}

type fileItem struct {
	Pwd       bool   `json:"pwd"`
	Nonce     []byte `json:"nonce"`
	Auth      string `json:"auth"`
	Token     string `json:"token"`
	Meta      string `json:"meta"`
	Expire    int64  `json:"expire"`
	DownLimit int    `json:"down_limit"`
	DownCount int    `json:"down_count"`
	Length    int64  `json:"length"`
}

type initResponse struct {
	ID         string `json:"id"`
	OwnerToken string `json:"ownerToken"`
	URL        string `json:"url"`
}

type wsData struct {
	Authorization string `json:"authorization"`
	Down          int    `json:"dlimit"`
	FileMetadata  string `json:"fileMetadata"`
	TimeLimit     int    `json:"timeLimit"`
	HasPassword   bool   `json:"has_password"`
}

var (
	writeWait  = 1 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10

	maxMessageSize = int64(10 * megabyte)
	newline        = []byte{'\n'}
	//space          = []byte{' '}
)

func wsHandler(conn *websocket.Conn) {
	client := newClient(conn)
	taskSubmit(client.readPump)
	taskSubmit(client.writePump)
}

func newClient(conn *websocket.Conn) *wsClient {
	channel := &chanSet{
		close: make(chan struct{}, 6),
		write: make(chan []byte, 16),
		read:  make(chan []byte, 16),
	}
	return &wsClient{false, conn, channel}
}

func (c *wsClient) pongHandler(string) error {
	err := c.conn.SetReadDeadline(time.Now().Add(pongWait))
	errLogger("wsClient.SetReadDeadline()", err)
	return nil
}

func (c *wsClient) readPump() {
	defer func() {
		c.channel.close <- struct{}{}
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetPongHandler(c.pongHandler)
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		if c.init {
			select {
			case <-c.channel.close:
				return
			default:
				c.channel.read <- message
			}
		} else {
			var meta wsData
			if err := json.Unmarshal(message, &meta); err != nil {
				break
			}
			fileID := randomHexStr(16)
			if meta.TimeLimit > 604800 {
				meta.TimeLimit = 0
			}
			if meta.Down > 300 {
				meta.Down = 0
			}
			res := fileItem{
				Pwd:       meta.HasPassword,
				Auth:      strings.Split(meta.Authorization, " ")[1],
				Meta:      meta.FileMetadata,
				Token:     randomHexStr(20),
				Nonce:     randomByte(16),
				Expire:    time.Now().Add(time.Duration(meta.TimeLimit) * time.Second).Unix(),
				DownLimit: meta.Down,
			}
			resp, _ := json.Marshal(initResponse{
				ID:         fileID,
				OwnerToken: res.Token,
				URL:        fmt.Sprintf("https://neko.nz/download/%s", fileID),
			})
			fileMap.Set(fileID, res)
			c.init = true
			c.channel.write <- resp
			taskSubmit(func() { wsUploadHandler(c, fileID) })
		}
	}
}

func (c *wsClient) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.channel.close <- struct{}{}
		_ = c.conn.Close()
	}()
	for {
		select {
		case <-c.channel.close:
			return
		case message, ok := <-c.channel.write:
			err := c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			errLogger("wsClient.conn.SetWriteDeadline()", err)
			if !ok {
				// channel closed.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				errLogger("wsClient.conn.NextWriter()", err)
				return
			}
			_, err = w.Write(message)
			errLogger("wsClient.conn.Write()", err)

			n := len(c.channel.write)
			for i := 0; i < n; i++ {
				_, err := w.Write(newline)
				errLogger("wsClient.conn.Write(newline)", err)
				_, err = w.Write(<-c.channel.write)
				errLogger("wsClient.conn.Write(msg)", err)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			err := c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			errLogger("wsClient.conn.SetWriteDeadline()", err)
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func wsUploadHandler(c *wsClient, id string) {
	defer func() {
		c.channel.close <- struct{}{}
	}()
	path := "data/"
	if !isExist(path) {
		err := os.MkdirAll(path, 00666)
		if err != nil {
			errLogger("ws.mkdir()", err)
			return
		}
	}
	filePath := path + id + ".bin"
	file, err := os.Create(filePath)
	sizeCounter := int64(0)
	if err != nil {
		errLogger("initHandler.file.Create()", err)
		return
	}
	defer func() {
		_ = file.Close()
	}()
	for {
		var n int
		select {
		case <-c.channel.close:
			_ = file.Close()
			_ = os.Remove(filePath)
			return
		case msg, ok := <-c.channel.read:
			if !ok {
				return
			}
			if msg[0] == 0 && len(msg) == 1 {
				// Upload Finished
				c.channel.write <- []byte("{\"ok\": true}")
				if res, ok := fileMap.Get(id); ok {
					val := res.(fileItem)
					val.Length = sizeCounter
					fileMap.Set(id, res)
				}
				return
			} else {
				n, _ = file.Write(msg)
			}
			atomic.AddInt64(&sizeCounter, int64(n))
			if sizeCounter > uploadLimit {
				_ = file.Close()
				_ = os.Remove(filePath)
				return
			}
		}
	}
}

func randomHexStr(digit uint32) string {
	b := make([]byte, digit)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:digit]
}

func randomByte(digit uint32) []byte {
	b := make([]byte, digit)
	_, _ = rand.Read(b)
	return b
}
