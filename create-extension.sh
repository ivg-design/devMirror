#!/usr/bin/expect -f

set timeout 60
spawn npx yo code

expect "What type of extension do you want to create?"
send "\r"

expect "What's the name of your extension?"
send "My Extension\r"

expect "What's the identifier of your extension?"
send "my-extension\r"

expect "What's the description of your extension?"
send "A VS Code extension built with TypeScript\r"

expect "Initialize a git repository?"
send "Y\r"

expect "Bundle source code with webpack?"
send "n\r"

expect "Which package manager to use?"
send "\r"

expect eof