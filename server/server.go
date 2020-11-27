package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"github.com/gorilla/websocket"
	"github.com/panjf2000/ants/v2"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var (
	cidrSet   []*net.IPNet
	fileHandler = http.FileServer(http.Dir(filepath.Join(basePath, "dist")))
	wsInit      = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	preDefBlock = os.Getenv("pub")
	preDefName = os.Getenv("pub2")
)

type request struct {
	r *http.Request
	c chan struct{}
	w *http.ResponseWriter
}

func init() {
	preDefBlock = strings.ReplaceAll(preDefBlock, "</script>", ";var downloadMetadata = %s;</script>")
	v := ipGet("https://www.cloudflare.com/ips-v4")
	for _, item := range v {
		_, network, _ := net.ParseCIDR(item)
		cidrSet = append(cidrSet, network)
	}

	v = ipGet("https://www.cloudflare.com/ips-v6")
	for _, item := range v {
		_, network, _ := net.ParseCIDR(item)
		cidrSet = append(cidrSet, network)
	}
	log.Println(cidrSet)
}

func getIndex() string {
	base, _ := ioutil.ReadFile(filepath.Join(basePath, "dist", "index.html"))
	return string(base)
}

func ipGet(url string) []string {
	v, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	content, err := ioutil.ReadAll(v.Body)
	if err != nil {
		log.Fatal(err)
	}
	_ = v.Body.Close()
	return strings.Split(strings.TrimSpace(string(content)), "\n")
}


func httpHandler() {
	httpWorkerPool, _ = ants.NewPoolWithFunc(10000, func(payload interface{}) {
		update, ok := payload.(*request)
		if !ok {
			return
		}
		requestHandler(*update.w, update.r)
		update.c <- struct{}{}
	})
	defer httpWorkerPool.Release()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		req := &request{r: r, c: make(chan struct{}), w: &w}
		err := httpWorkerPool.Invoke(req)
		if err != nil {
			http.Error(w, "throttle limit error", http.StatusInternalServerError)
			return
		}
		<-req.c
	})
	go initHttpServer(mux)
	initTlsServer(mux)
}

func initHttpServer(mux http.Handler) {
	for {
		log.Println("http server initialized")
		err := http.ListenAndServe("127.0.0.1:32147", mux)
		log.Println("http error: ", err)
		time.Sleep(time.Second)
	}
}

func initTlsServer(mux http.Handler) {
	ca, cert, key := getCertSuite()
	cer, err := tls.X509KeyPair(cert, key)
	if err != nil {
		log.Fatal(err)
	}
	roots := x509.NewCertPool()
	ok := roots.AppendCertsFromPEM(ca)
	if !ok {
		log.Fatal("failed to parse root certificate")
	}

	tlsConfig := &tls.Config{
		MinVersion:               tls.VersionTLS11,
		CurvePreferences:         []tls.CurveID{tls.CurveP521, tls.CurveP384, tls.CurveP256},
		PreferServerCipherSuites: true,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA,
			tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_RSA_WITH_AES_256_CBC_SHA,
		},
		Certificates: []tls.Certificate{cer},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    roots,
	}
	server := http.Server{
		Addr: ":443",
		Handler: mux,
		TLSConfig: tlsConfig,
		ConnContext: func(ctx context.Context, c net.Conn) context.Context {
			addr, _ := net.ResolveTCPAddr(c.RemoteAddr().Network(), c.RemoteAddr().String())
			flag := false
			for _, item := range cidrSet {
				if item.Contains(addr.IP) {
					flag = true
				}
			}
			if !flag && addr.IP.String() != "127.0.0.1" {
				_ = c.Close()
				log.Println("Denied illegal address", addr.IP.String())
			}
			return ctx
		},
	}
	for {
		log.Println("tls server initialized")
		err := server.ListenAndServeTLS("", "")
		log.Println("tls error: ", err)
		time.Sleep(time.Second)
	}
}

func requestHandler(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if err := recover(); err != nil && err != http.ErrAbortHandler {
			w.WriteHeader(http.StatusInternalServerError)
			log.Println(err)
		}
	}()
	if strings.HasPrefix(r.URL.Path, "/api") {
		if r.URL.Path == "/api/ws" {
			conn, err := wsInit.Upgrade(w, r, nil)
			if err != nil {
				errLogger("req.ws.upgrade()", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			taskSubmit(func() { wsHandler(conn) })
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/info") {
			infoHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/exist") {
			existHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/delete") {
			deleteHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/password") {
			pwdHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/metadata") {
			metaHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/download") {
			downloadHandler(w, r)
			return
		}
	}
	if r.Method == "GET" {
		if strings.Contains(r.URL.Path, "favicon.ico") {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if strings.Contains(r.URL.Path, ".") {
			r.URL.Path = path.Base(r.URL.Path)
			fileHandler.ServeHTTP(w, r)
			return
		}
		cpr, _ := json.Marshal(map[string]interface{}{
			"status": 404,
		})
		if strings.HasPrefix(r.URL.Path, "/download") {
			id := path.Base(r.URL.Path)
			if v, ok := fileMap.Get(id); ok {
				res := v.(fileItem)
				cpr, _ = json.Marshal(map[string]interface{}{
					"status": 200,
					"nonce":  b58encode(res.Nonce),
					"pwd":    res.Pwd,
				})
			}
		}
		resp := strings.Replace(getIndex(), "</body>", fmt.Sprintf(preDefBlock, cpr), 1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Length", strconv.Itoa(len(resp)))
		_, _ = w.Write([]byte(resp))
		return
	}

	http.NotFound(w, r)
	return
}
