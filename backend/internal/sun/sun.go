// Package sun vérifie les liens « Secure Unique NFC » des puces NTAG 424 DNA
// (NXP AN12196) : déchiffrement de PICCData et contrôle du SDMMAC.
package sun

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
)

var (
	ErrFormat = errors.New("lien de carte mal formé")
	ErrMAC    = errors.New("signature de la carte invalide")
)

// Keys fournit les clés AES-128 : la clé de lecture des métadonnées est
// commune à toutes les cartes (l'UID n'est connu qu'après déchiffrement),
// la clé de lecture du fichier est propre à chaque carte.
type Keys interface {
	MetaRead() []byte
	FileRead(uid []byte) []byte
}

// Tap est le résultat vérifié d'un passage de carte.
type Tap struct {
	UID     string // hexadécimal majuscule, 14 caractères
	Counter int    // SDMReadCtr, croît à chaque lecture
}

// Verify contrôle les paramètres e (PICCData chiffré, 32 hex) et c (SDMMAC, 16 hex).
func Verify(keys Keys, e, c string) (Tap, error) {
	enc, err := hex.DecodeString(e)
	if err != nil || len(enc) != 16 {
		return Tap{}, ErrFormat
	}
	mac, err := hex.DecodeString(c)
	if err != nil || len(mac) != 8 {
		return Tap{}, ErrFormat
	}
	block, err := aes.NewCipher(keys.MetaRead())
	if err != nil {
		return Tap{}, err
	}
	plain := make([]byte, 16)
	cipher.NewCBCDecrypter(block, make([]byte, 16)).CryptBlocks(plain, enc)
	// PICCDataTag 0xC7 : UID (7 octets) et compteur mirrorés.
	if plain[0] != 0xC7 {
		return Tap{}, ErrMAC
	}
	uid, ctr := plain[1:8], plain[8:11]
	want, err := SDMMAC(keys.FileRead(uid), uid, ctr)
	if err != nil {
		return Tap{}, err
	}
	if subtle.ConstantTimeCompare(want, mac) != 1 {
		return Tap{}, ErrMAC
	}
	return Tap{
		UID:     strings.ToUpper(hex.EncodeToString(uid)),
		Counter: int(ctr[0]) | int(ctr[1])<<8 | int(ctr[2])<<16,
	}, nil
}

// SDMMAC calcule la signature tronquée (octets impairs du CMAC) sur une
// entrée vide, le cas d'un lien qui ne mirroire pas de données de fichier.
func SDMMAC(fileReadKey, uid, ctr []byte) ([]byte, error) {
	sv2 := append([]byte{0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80}, uid...)
	sv2 = append(sv2, ctr...)
	sessionKey, err := CMAC(fileReadKey, sv2)
	if err != nil {
		return nil, err
	}
	full, err := CMAC(sessionKey, nil)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 8)
	for i := range out {
		out[i] = full[2*i+1]
	}
	return out, nil
}

// MasterKeys dérive toutes les clés d'une clé maître (diversification par
// CMAC, dans l'esprit de NXP AN10922), avec une entrée d'au moins 16 octets.
type MasterKeys struct{ Master []byte }

func (m MasterKeys) derive(label string, extra []byte) []byte {
	msg := append([]byte{0x01}, []byte(label)...)
	msg = append(msg, extra...)
	k, err := CMAC(m.Master, msg)
	if err != nil {
		panic(err)
	}
	return k
}

func (m MasterKeys) MetaRead() []byte           { return m.derive("EDUPILOT/SDM-META/v1", nil) }
func (m MasterKeys) FileRead(uid []byte) []byte { return m.derive("EDUPILOT/SDM-FILE/v1", uid) }

// Application renvoie la clé maîtresse d'application (clé 0) à poser sur la carte.
func (m MasterKeys) Application(uid []byte) []byte { return m.derive("EDUPILOT/APP-MASTER/v1", uid) }

// StaticKeys sert aux vecteurs de test (mêmes clés pour toutes les cartes).
type StaticKeys struct{ Meta, File []byte }

func (s StaticKeys) MetaRead() []byte       { return s.Meta }
func (s StaticKeys) FileRead([]byte) []byte { return s.File }

// Simulate produit les paramètres e et c qu'une carte programmée avec ces
// clés générerait pour une lecture donnée (tests, test de charge, démonstration).
func Simulate(keys Keys, uid []byte, counter int) (string, string, error) {
	plain := append([]byte{0xC7}, uid...)
	ctr := []byte{byte(counter), byte(counter >> 8), byte(counter >> 16)}
	plain = append(plain, ctr...)
	plain = append(plain, make([]byte, 16-len(plain))...)
	block, err := aes.NewCipher(keys.MetaRead())
	if err != nil {
		return "", "", err
	}
	enc := make([]byte, 16)
	cipher.NewCBCEncrypter(block, make([]byte, 16)).CryptBlocks(enc, plain)
	mac, err := SDMMAC(keys.FileRead(uid), uid, ctr)
	if err != nil {
		return "", "", err
	}
	return strings.ToUpper(hex.EncodeToString(enc)), strings.ToUpper(hex.EncodeToString(mac)), nil
}
