package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

type metaResponse struct {
	Metadata string `json:"metadata"`
	Final    bool   `json:"finalDownload"`
	TTL      int64  `json:"ttl"`
}

type infoResponse struct {
	DownloadLimit int   `json:"dlimit"`
	DownloadCount int   `json:"dtotal"`
	Last          int64 `json:"ttl"`
	Exist         bool  `json:"exist"`
}

type existResponse struct {
	Pwd bool `json:"requiresPassword"`
}

type ownerBody struct {
	ID         []string `json:"id"`
	OwnerToken []string `json:"owner_token"`
}

type authBody struct {
	Auth       string `json:"auth"`
	OwnerToken string `json:"owner_token"`
}

func ownerTokenExtractor(r *http.Request) ([]string, []string) {
	var own ownerBody
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		return nil, nil
	}
	if err := json.Unmarshal(body, &own); err != nil {
		return nil, nil
	}
	return own.ID, own.OwnerToken
}

func authExtractor(r *http.Request) (string, string) {
	var own authBody
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		return "", ""
	}
	if err := json.Unmarshal(body, &own); err != nil {
		return "", ""
	}
	//log.Println(own)
	return own.OwnerToken, own.Auth
}

func pwdHandler(w http.ResponseWriter, r *http.Request) {
	id := path.Base(r.URL.Path)
	token, auth := authExtractor(r)
	if token == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if v, ok := fileMap.Get(id); ok {
		res := v.(fileItem)
		if res.Token != token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		res.Auth = auth
		res.Pwd = true
		fileMap.Set(id, res)
		w.WriteHeader(http.StatusOK)
		return
	} else {
		http.NotFound(w, r)
	}
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	//id := path.Base(r.URL.Path)
	id, token := ownerTokenExtractor(r)
	if token == nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	for e, item := range id {
		if res := itemInfo(item); res != nil {
			if res.Token != token[e] {
				continue
			}
			fileMap.Remove(item)
			_ = os.Remove(path.Join("data", item+".bin"))
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func itemInfo(id string) *fileItem {
	if v, ok := fileMap.Get(id); ok {
		res := v.(fileItem)
		return &res
	}
	return nil
}

func infoHandler(w http.ResponseWriter, r *http.Request) {
	id, token := ownerTokenExtractor(r)
	if token == nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	var result []infoResponse
	for e, item := range id {
		if res := itemInfo(item); res != nil {
			if res.Token != token[e] {
				result = append(result, infoResponse{})
				continue
			}
			result = append(result, infoResponse{
				DownloadLimit: res.DownLimit,
				DownloadCount: res.DownCount,
				Last:          (res.Expire - time.Now().Unix()) * 1000,
				Exist:         true,
			})
		} else {
			result = append(result, infoResponse{Exist: false})
		}
	}
	resp, _ := json.Marshal(result)
	_, _ = w.Write(resp)
}

func existHandler(w http.ResponseWriter, r *http.Request) {
	id := path.Base(r.URL.Path)
	if v, ok := fileMap.Get(id); ok {
		res := v.(fileItem)
		resp, _ := json.Marshal(existResponse{false})
		w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(res.Nonce))
		_, _ = w.Write(resp)
		return
	} else {
		http.NotFound(w, r)
	}
}

func metaHandler(w http.ResponseWriter, r *http.Request) {
	id := path.Base(r.URL.Path)
	authHeader := r.Header.Get("Authorization")
	if !strings.Contains(authHeader, " ") {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	authBlock := strings.Split(authHeader, " ")[1]
	if v, ok := fileMap.Get(id); ok {
		res := v.(fileItem)

		if !bytes.Equal(sign(res.Auth, res.Nonce), b58decode(authBlock)) {
			//log.Println(res.auth, b58encode(res.nonce))
			w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(res.Nonce))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		nonce := fileMap.rotateNonce(id)
		w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(nonce))
		exp := res.Expire - time.Now().Unix()
		if exp < 0 && res.DownLimit != 0 {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		rs := metaResponse{
			Metadata: res.Meta,
			Final:    res.DownCount >= res.DownLimit && res.DownLimit != 0,
			TTL:      exp * 1000,
		}
		resp, _ := json.Marshal(rs)
		_, _ = w.Write(resp)
		return
	} else {
		http.NotFound(w, r)
	}
}

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	id := path.Base(r.URL.Path)
	authHeader := r.Header.Get("Authorization")
	if !strings.Contains(authHeader, " ") {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	authBlock := strings.Split(authHeader, " ")[1]
	if v, ok := fileMap.Get(id); ok {
		res := v.(fileItem)
		if !bytes.Equal(sign(res.Auth, res.Nonce), b58decode(authBlock)) {
			//log.Println(res.auth, b58encode(res.nonce))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if res.DownCount > res.DownLimit && res.DownLimit != 0 {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		fileMap.addDown(id)
		fileMap.rotateNonce(id)
		w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(res.Nonce))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.FormatInt(res.Length, 10))
		http.ServeFile(w, r, path.Join("data", id+".bin"))
		return
	} else {
		http.NotFound(w, r)
	}
}

func (m *ConcurrentMap) rotateNonce(id string) []byte {
	shard := m.GetShard(id)
	newNonce := randomByte(16)
	shard.Lock()
	if v, ok := shard.items[id]; ok {
		val := v.(fileItem)
		val.Nonce = newNonce
		shard.items[id] = val
	}
	shard.Unlock()
	return newNonce
}

func (m *ConcurrentMap) addDown(id string) {
	shard := m.GetShard(id)
	shard.Lock()
	if v, ok := shard.items[id]; ok {
		val := v.(fileItem)
		val.DownCount++
		shard.items[id] = val
	}
	shard.Unlock()
}

func b58encode(a []byte) string {
	return Encode(a, bs58)
}

func b58decode(a string) []byte {
	return Decode(a, bs58)
}

func sign(key string, nonce []byte) []byte {
	byteKey := b58decode(key)
	mac := hmac.New(sha256.New, byteKey)
	mac.Write(nonce)
	return mac.Sum(nil)
}
