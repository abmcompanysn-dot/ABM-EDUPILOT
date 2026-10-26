package sun

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"strings"
	"testing"
)

func unhex(s string) []byte {
	b, err := hex.DecodeString(strings.ReplaceAll(s, " ", ""))
	if err != nil {
		panic(err)
	}
	return b
}

// Vecteurs de la RFC 4493.
func TestCMACRFC4493(t *testing.T) {
	key := unhex("2b7e151628aed2a6abf7158809cf4f3c")
	msg := unhex("6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51 30c81c46a35ce411e5fbc1191a0a52ef f69f2445df4f9b17ad2b417be66c3710")
	cases := []struct {
		n    int
		want string
	}{
		{0, "bb1d6929e95937287fa37d129b756746"},
		{16, "070a16b46b4d4144f79bdd9dd04a287c"},
		{40, "dfa66747de9ae63030ca32611497c827"},
		{64, "51f0bebf7e3b9d92fc49741779363cfe"},
	}
	for _, c := range cases {
		got, err := CMAC(key, msg[:c.n])
		if err != nil {
			t.Fatal(err)
		}
		if hex.EncodeToString(got) != c.want {
			t.Errorf("CMAC(%d octets) = %x, attendu %s", c.n, got, c.want)
		}
	}
}

// Exemple de NXP AN12196 (clés à zéro).
func TestVerifyAN12196(t *testing.T) {
	keys := StaticKeys{Meta: make([]byte, 16), File: make([]byte, 16)}
	tap, err := Verify(keys, "EF963FF7828658A599F3041510671E88", "94EED9EE65337086")
	if err != nil {
		t.Fatal(err)
	}
	if tap.UID != "04DE5F1EACC040" || tap.Counter != 61 {
		t.Fatalf("obtenu %+v", tap)
	}
	if _, err := Verify(keys, "EF963FF7828658A599F3041510671E88", "94EED9EE65337087"); err != ErrMAC {
		t.Fatalf("une signature altérée doit être refusée, obtenu %v", err)
	}
}

// Aller-retour avec des clés dérivées : ce qu'une carte programmée produirait.
func TestRoundTripDerivedKeys(t *testing.T) {
	m := MasterKeys{Master: unhex("00112233445566778899aabbccddeeff")}
	uid := unhex("04A1B2C3D4E5F6")
	ctr := []byte{0x2A, 0x00, 0x00}
	plain := append([]byte{0xC7}, uid...)
	plain = append(plain, ctr...)
	plain = append(plain, make([]byte, 5)...)
	block, _ := aes.NewCipher(m.MetaRead())
	enc := make([]byte, 16)
	cipher.NewCBCEncrypter(block, make([]byte, 16)).CryptBlocks(enc, plain)
	mac, _ := SDMMAC(m.FileRead(uid), uid, ctr)
	tap, err := Verify(m, hex.EncodeToString(enc), hex.EncodeToString(mac))
	if err != nil {
		t.Fatal(err)
	}
	if tap.UID != "04A1B2C3D4E5F6" || tap.Counter != 42 {
		t.Fatalf("obtenu %+v", tap)
	}
	if bytes.Equal(m.FileRead(uid), m.FileRead(unhex("04A1B2C3D4E5F7"))) {
		t.Fatal("deux cartes ne doivent pas partager la même clé")
	}
}
