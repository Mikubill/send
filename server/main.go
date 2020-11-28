package main

import (
	jsoniter "github.com/json-iterator/go"
	"github.com/panjf2000/ants/v2"
	"io/ioutil"
	"log"
	"os"
	"path"
	"path/filepath"
	"time"
)

var (
	httpWorkerPool *ants.PoolWithFunc
	basePath, _    = filepath.Abs("/")
	bs58           = NewAlphabet("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
	json           = jsoniter.ConfigCompatibleWithStandardLibrary
	defaultPool, _ = ants.NewPool(32768)
	//captcha, _     = recaptcha.NewReCAPTCHA(os.Getenv("captcha"), recaptcha.V3, 10 * time.Second)
)

func main() {
	taskSubmit(configSync)
	taskSubmit(diskUsageUpdater)
	defer func() {
		defaultPool.Release()
		httpWorkerPool.Release()
	}()
	httpHandler()
	cleanHandler()
}

func configSync() {
	if !isExist("config/") {
		err := os.MkdirAll("config/", 00666)
		if err != nil {
			errLogger("ws.mkdir()", err)
			return
		}
	}
	m, err := ioutil.ReadFile("config/data.json")
	if err == nil {
		err = UnmarshalJSON(&fileMap, m)
		log.Println(err)
	}
	for {
		s, err := MarshalJSON(fileMap)
		if err == nil {
			_ = ioutil.WriteFile("config/data.json", s, 0666)
		}
		time.Sleep(10*time.Minute)
	}
}

func MarshalJSON(m ConcurrentMap) ([]byte, error) {
	// Create a temporary map, which will hold all item spread across shards.
	tmp := make(map[string]fileItem)

	// Insert items to temporary map.
	for item := range m.IterBuffered() {
		tmp[item.Key] = item.Val.(fileItem)
	}
	return json.Marshal(tmp)
}

func UnmarshalJSON(m *ConcurrentMap, b []byte) (err error) {
	// Reverse process of Marshal.

	tmp := make(map[string]fileItem)

	// Unmarshal into a single map.
	if err := json.Unmarshal(b, &tmp); err != nil {
		return nil
	}

	// foreach key,value pair in temporary map insert into our concurrent map.
	for key, val := range tmp {
		m.Set(key, val)
	}
	return nil
}

func cleanHandler() {
	for {
		time.Sleep(time.Hour)
		fileMap.IterCb(func(key string, v interface{}) {
			res := v.(fileItem)
			if res.Expire < time.Now().Unix() {
				fileMap.Remove(key)
				_ = os.Remove(path.Join("data", key+".bin"))
			}
		})
	}
}
