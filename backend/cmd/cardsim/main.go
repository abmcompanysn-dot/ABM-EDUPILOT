// Command cardsim simule le passage d'une carte NTAG 424 DNA : il affiche le
// lien signé que la puce produirait, pour tester sans matériel.
//
//	go run ./cmd/cardsim -uid 04D3D83F510531 -counter 1 -base http://localhost:8080
package main

import (
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"edupilot/internal/sun"
)

func main() {
	uidHex := flag.String("uid", "", "UID de la carte (14 caractères hexadécimaux)")
	counter := flag.Int("counter", 1, "compteur de lecture (doit augmenter à chaque passage)")
	base := flag.String("base", "http://localhost:8080", "adresse publique d'EduPilote")
	masterHex := flag.String("master", os.Getenv("EDUPILOT_CARD_MASTER_KEY"), "clé maître des cartes (hex) ; zéros en développement")
	flag.Parse()
	uid, err := hex.DecodeString(strings.ReplaceAll(*uidHex, ":", ""))
	if err != nil || len(uid) != 7 {
		log.Fatal("-uid : 7 octets en hexadécimal attendus, ex. 04D3D83F510531")
	}
	master := make([]byte, 16)
	if *masterHex != "" {
		if master, err = hex.DecodeString(*masterHex); err != nil || len(master) != 16 {
			log.Fatal("-master : 16 octets en hexadécimal attendus")
		}
	}
	e, c, err := sun.Simulate(sun.MasterKeys{Master: master}, uid, *counter)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%s/id?e=%s&c=%s\n", strings.TrimRight(*base, "/"), e, c)
}
