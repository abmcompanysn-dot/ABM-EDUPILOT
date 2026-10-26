package sun

import "crypto/aes"

// CMAC calcule AES-CMAC (RFC 4493).
func CMAC(key, msg []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	k1, k2 := subkeys(block)
	n := (len(msg) + 15) / 16
	complete := n > 0 && len(msg)%16 == 0
	if n == 0 {
		n = 1
	}
	last := make([]byte, 16)
	if complete {
		copy(last, msg[(n-1)*16:])
		xor(last, k1)
	} else {
		rem := msg[(n-1)*16:]
		copy(last, rem)
		last[len(rem)] = 0x80
		xor(last, k2)
	}
	x := make([]byte, 16)
	for i := 0; i < n-1; i++ {
		xor(x, msg[i*16:(i+1)*16])
		block.Encrypt(x, x)
	}
	xor(x, last)
	block.Encrypt(x, x)
	return x, nil
}

func subkeys(block interface{ Encrypt(dst, src []byte) }) ([]byte, []byte) {
	l := make([]byte, 16)
	block.Encrypt(l, l)
	k1 := shiftLeft(l)
	if l[0]&0x80 != 0 {
		k1[15] ^= 0x87
	}
	k2 := shiftLeft(k1)
	if k1[0]&0x80 != 0 {
		k2[15] ^= 0x87
	}
	return k1, k2
}

func shiftLeft(b []byte) []byte {
	out := make([]byte, len(b))
	for i := range b {
		out[i] = b[i] << 1
		if i+1 < len(b) {
			out[i] |= b[i+1] >> 7
		}
	}
	return out
}

func xor(dst, src []byte) {
	for i := range dst {
		dst[i] ^= src[i]
	}
}
