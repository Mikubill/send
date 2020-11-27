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
}

type existResponse struct {
	Pwd bool `json:"requiresPassword"`
}

type ownerBody struct {
	OwnerToken string `json:"owner_token"`
}

type authBody struct {
	Auth       string `json:"auth"`
	OwnerToken string `json:"owner_token"`
}

func ownerTokenExtractor(r *http.Request) string {
	var own ownerBody
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		return ""
	}
	if err := json.Unmarshal(body, &own); err != nil {
		return ""
	}
	return own.OwnerToken
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
	id := path.Base(r.URL.Path)
	token := ownerTokenExtractor(r)
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
		fileMap.Remove(id)
		_ = os.Remove(path.Join("data", id+".bin"))
		w.WriteHeader(http.StatusNoContent)
		return
	} else {
		http.NotFound(w, r)
	}
}

func infoHandler(w http.ResponseWriter, r *http.Request) {
	id := path.Base(r.URL.Path)
	token := ownerTokenExtractor(r)
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
		resp, _ := json.Marshal(infoResponse{
			DownloadLimit: res.DownLimit,
			DownloadCount: res.DownCount,
			Last:          (res.Expire - time.Now().Unix()) * 1000,
		})
		_, _ = w.Write(resp)
		return
	} else {
		http.NotFound(w, r)
	}
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

		res.Nonce = randomByte(16)
		w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(res.Nonce))
		fileMap.Set(id, res)
		rs := metaResponse{
			Metadata: res.Meta,
			Final:    res.DownCount >= res.DownLimit,
			TTL:      (res.Expire - time.Now().Unix()) * 1000,
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
		res.Nonce = randomByte(16)
		res.DownCount++
		if res.DownCount < res.DownLimit || res.DownLimit == 0 {
			fileMap.Set(id, res)
		} else {
			fileMap.Remove(id)
		}
		w.Header().Set("WWW-Authenticate", "send-v1 "+b58encode(res.Nonce))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.FormatInt(res.Length, 10))
		http.ServeFile(w, r, path.Join("data", id+".bin"))
		if res.DownCount >= res.DownLimit && res.DownLimit != 0 {
			_ = os.Remove(path.Join("data", id+".bin"))
		}
		return
	} else {
		http.NotFound(w, r)
	}
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
