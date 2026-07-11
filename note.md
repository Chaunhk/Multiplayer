npm run dev/start
New-NetFirewallRule -DisplayName "Colyseus Server" -Direction Inbound -Protocol TCP -LocalPort 2567 -Action Allow
New-NetFirewallRule -DisplayName "Colyseus Server" -Direction Inbound -Protocol TCP -LocalPort 2567 -Action Allow
Get-NetFirewallRule -DisplayName "Colyseus Server"
Get-NetFirewallRule -DisplayName "Colyseus Server"
curl -v http://192.168.1.228:2567
curl -v -X POST http://192.168.1.228:2567/matchmake/joinOrCreate/game_room -H "Content-Type: application/json" -d "{}"
