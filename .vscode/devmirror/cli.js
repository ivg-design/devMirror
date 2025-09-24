#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const cli = config.cliPath;
require(cli);
