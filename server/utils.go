package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"syscall"
	"time"
)

var diskStat tmpStat

type tmpStat struct {
	Total     int64 `json:"total"`
	Available int64 `json:"available"`
}

func isExist(path string) bool {
	_, err := os.Stat(path)
	if err != nil {
		if os.IsExist(err) {
			return true
		}
		if os.IsNotExist(err) {
			return false
		}
		//log.Println(err)
		return false
	}
	return true
}

func diskUsageUpdater() {
	log.Println("Disk Monitor Initialized.")
	for {
		fs := syscall.Statfs_t{}
		err := syscall.Statfs("/data", &fs)
		if err != nil {
			continue
		}
		diskStat.Available = int64(fs.Bfree * uint64(fs.Bsize))
		diskStat.Total = int64(fs.Blocks * uint64(fs.Bsize))
		//log.Printf("%+v", diskStat)
		time.Sleep(time.Minute)
	}
}

func respBuilder(resp interface{}) []byte {
	encoded, err := json.Marshal(resp)
	if err != nil {
		log.Println(err)
		return []byte{'0'}
	}
	return encoded
}

func taskSubmit(f func()) {
	err := defaultPool.Submit(f)
	errLogger("handler.taskSubmit()", err)
}

func genRandString(byteLength int) (uuid string) {

	b := make([]byte, byteLength)
	_, err := rand.Read(b)
	if err != nil {
		return
	}

	uuid = hex.EncodeToString(b[:])
	return uuid
}

func errLogger(function string, err error) {
	if err != nil {
		t := fmt.Sprintf("%s returned %v", function, err)
		log.Printf(t)
		//publicChat.broadcast <- &wsBroadcast{message: []byte(t), client: sysLogger}
	}
}

type cfPostData struct {
	Hostname []string `json:"hostnames"`
	Valid    int      `json:"requested_validity"`
	T        string   `json:"request_type"`
	CSR      string   `json:"csr"`
}

type cfPostResponse struct {
	Success bool `json:"success"`
	Result  struct {
		ID          string `json:"id"`
		Certificate string `json:"certificate"`
	}
}

func getCertSuite() ([]byte, []byte, []byte) {
	ca := getCloudFlareCA()
	cert, key := getCert()
	return ca, cert, key
}

func getCloudFlareCA() []byte {
	url := "https://support.cloudflare.com/hc/en-us/article_attachments/360044928032/origin-pull-ca.pem"
	resp, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}
	_ = resp.Body.Close()
	return body
}

func getCert() ([]byte, []byte) {

	// step: generate a keypair
	keys, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		log.Fatalf("unable to genarate private keys, error: %s", err)
	}

	// step: generate a csr template
	var csrTemplate = x509.CertificateRequest{
		Subject:            pkix.Name{Organization: []string{genRandString(16)}},
		SignatureAlgorithm: x509.ECDSAWithSHA256,
	}
	// step: generate the csr request
	csrCertificate, err := x509.CreateCertificateRequest(rand.Reader, &csrTemplate, keys)
	if err != nil {
		log.Fatal(err)
	}
	csr := string(pem.EncodeToMemory(&pem.Block{
		Type: "CERTIFICATE REQUEST", Bytes: csrCertificate,
	}))

	postData := respBuilder(&cfPostData{
		Hostname: []string{preDefName},
		Valid:    5475,
		T:        "origin-ecc",
		CSR:      csr,
	})
	client := &http.Client{}
	url := "https://api.cloudflare.com/client/v4/certificates"
	req, err := http.NewRequest("POST", url, bytes.NewReader(postData))
	if err != nil {
		log.Fatal(err)
	}
	req.Header.Set("X-Auth-User-Service-Key", os.Getenv("service"))

	resp, err := client.Do(req)
	if err != nil {
		log.Fatal(err)
	}

	var cfResp cfPostResponse
	s, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}
	_ = resp.Body.Close()

	if err := json.Unmarshal(s, &cfResp); err != nil {
		log.Fatal(err)
	}

	certPrivateKeyPEM := new(bytes.Buffer)
	c, err := x509.MarshalPKCS8PrivateKey(keys)
	if err != nil {
		log.Fatal(err)
	}

	err = pem.Encode(certPrivateKeyPEM, &pem.Block{
		Type:  "ECC PRIVATE KEY",
		Bytes: c,
	})
	if err != nil {
		log.Fatal(err)
	}

	cert := []byte(cfResp.Result.Certificate)
	privateKey := certPrivateKeyPEM
	//certID := cfResp.Result.ID
	return cert, privateKey.Bytes()
}
