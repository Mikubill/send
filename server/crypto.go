package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"io"
)

// CBC
func aesEncryptCBC(plaintext, encryptKey []byte) (ciphertext []byte) {
	hashedKey := sha256.Sum256(encryptKey)
	block, _ := aes.NewCipher(hashedKey[:])
	plaintext = pkcs5Padding(plaintext, aes.BlockSize)

	ciphertext = make([]byte, aes.BlockSize+len(plaintext))
	iv := ciphertext[:aes.BlockSize]
	_, _ = io.ReadFull(rand.Reader, iv)
	cbc := cipher.NewCBCEncrypter(block, iv)
	cbc.CryptBlocks(ciphertext[aes.BlockSize:], plaintext)
	return
}

func aesDecryptCBC(ciphertext, encryptKey []byte) (plaintext []byte) {
	hashedKey := sha256.Sum256(encryptKey)
	block, _ := aes.NewCipher(hashedKey[:])

	iv := ciphertext[:aes.BlockSize]
	ciphertext = ciphertext[aes.BlockSize:]
	cbc := cipher.NewCBCDecrypter(block, iv)
	cbc.CryptBlocks(ciphertext, ciphertext)

	plaintext = pkcs5UnPadding(ciphertext)
	return
}

func pkcs5Padding(ciphertext []byte, blockSize int) []byte {
	padding := blockSize - len(ciphertext)%blockSize
	padText := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(ciphertext, padText...)
}

func pkcs5UnPadding(origData []byte) []byte {
	length := len(origData)
	unPadding := int(origData[length-1])
	return origData[:(length - unPadding)]
}
