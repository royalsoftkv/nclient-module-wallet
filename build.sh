#!/bin/bash

rm -f nclient-module-wallet*.tgz
node increase_version.js
npm pack
cp nclient-module-wallet-*.tgz nclient-module-wallet.tgz
curl -F "file=@./nclient-module-wallet.tgz" http://159.69.2.203:3030/upload
