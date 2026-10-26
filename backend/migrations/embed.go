// Package migrations embarque les fichiers SQL appliqués au démarrage.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
