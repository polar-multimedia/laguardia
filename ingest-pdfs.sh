#!/bin/bash
# Script de ingesta de los 20 PDFs científicos al servidor Railway de Clara.
# Corre este script UNA SOLA VEZ desde tu terminal.
# Requiere: curl instalado (viene en Mac por default)

RAILWAY_URL="https://clara-server-production-cc8c.up.railway.app"
PDF_DIR="$(dirname "$0")/pdf"

if [ ! -d "$PDF_DIR" ]; then
  echo "❌ No se encontró la carpeta pdf/ en: $PDF_DIR"
  echo "   Pon este script en la raíz del proyecto Clara-Laguardia26"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Ingesta de PDFs → OpenAI Vector Store      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

SUCCESS=0
SKIP=0
FAIL=0

for f in "$PDF_DIR"/*.PDF "$PDF_DIR"/*.pdf; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  printf "📄  %-65s " "$name"

  response=$(curl -s -o /tmp/ingest_response.json -w "%{http_code}" \
    -X POST "$RAILWAY_URL/api/corpus/ingest" \
    -F "pdf=@$f;type=application/pdf" \
    --max-time 180)

  body=$(cat /tmp/ingest_response.json)

  case $response in
    200)
      file_id=$(echo "$body" | grep -o '"file_id":"[^"]*"' | head -1 | cut -d'"' -f4)
      echo "✅  → $file_id"
      ((SUCCESS++))
      ;;
    409)
      echo "⏩  ya ingresado"
      ((SKIP++))
      ;;
    404)
      echo "⚠️  no está en corpus-registry.json"
      ((FAIL++))
      ;;
    *)
      echo "❌  HTTP $response — $body"
      ((FAIL++))
      ;;
  esac
done

echo ""
echo "────────────────────────────────────────────────"
echo "  ✅ Exitosos : $SUCCESS"
echo "  ⏩ Ya tenían : $SKIP"
echo "  ❌ Fallos    : $FAIL"
echo ""
echo "Si todos son ✅ o ⏩, Clara ya tiene acceso al corpus completo."
