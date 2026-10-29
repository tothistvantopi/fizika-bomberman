#!/bin/bash
# Dupla kattintással indítható Macen: felépíti és elindítja a játékszervert.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "A Node.js nincs telepítve. Töltsd le: https://nodejs.org (LTS verzió), majd indítsd újra."
  read -n 1 -s -r -p "Nyomj meg egy gombot a kilépéshez..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Első indítás: csomagok telepítése (egyszer kell, internet szükséges)..."
  npm install || exit 1
fi

npm run build || exit 1
npm run start
