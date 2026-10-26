package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// seal chiffre un secret avant stockage (AES-256-GCM, nonce en préfixe).
func (a *App) seal(plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.Cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := randomBytes(gcm.NonceSize())
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func (a *App) open(sealed []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.Cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("secret scellé tronqué")
	}
	return gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
}

// signToken produit un jeton court signé (HMAC-SHA256) portant claims et expiration.
func (a *App) signToken(purpose string, claims map[string]any, ttl time.Duration) string {
	claims["p"] = purpose
	claims["x"] = a.Now().Add(ttl).Unix()
	body, _ := json.Marshal(claims)
	enc := base64.RawURLEncoding.EncodeToString(body)
	return enc + "." + a.mac(enc)
}

func (a *App) verifyToken(purpose, tok string) (map[string]any, bool) {
	enc, sig, ok := strings.Cut(tok, ".")
	if !ok || !hmac.Equal([]byte(sig), []byte(a.mac(enc))) {
		return nil, false
	}
	body, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return nil, false
	}
	var claims map[string]any
	if json.Unmarshal(body, &claims) != nil || claims["p"] != purpose {
		return nil, false
	}
	exp, _ := claims["x"].(float64)
	if a.Now().Unix() > int64(exp) {
		return nil, false
	}
	return claims, true
}

func (a *App) mac(s string) string {
	m := hmac.New(sha256.New, a.Cfg.SecretKey)
	m.Write([]byte(s))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(h), err
}

func checkPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// dummyHash égalise le temps de réponse quand l'email n'existe pas.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("edupilot-timing"), bcrypt.DefaultCost)

func validatePassword(pw string) error {
	if len(pw) < 8 {
		return invalid("le mot de passe doit contenir au moins 8 caractères")
	}
	if len(pw) > 72 {
		return invalid("le mot de passe ne doit pas dépasser 72 caractères")
	}
	return nil
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

func sha256Sum(s string) []byte {
	h := sha256.Sum256([]byte(s))
	return h[:]
}

// randomCode produit un code lisible sans caractères ambigus (0/O, 1/I/L).
func randomCode(n int) string {
	const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	b := randomBytes(n)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// tempPassword : mot de passe provisoire remis par l'admin, à changer à la connexion.
func tempPassword() string { return randomCode(4) + "-" + randomCode(4) + "-" + randomCode(4) }

func randomSlug() string { return strings.ToLower(hex.EncodeToString(randomBytes(9))) }
