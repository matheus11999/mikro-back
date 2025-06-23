:local url "https://api.lucro.top/api/mikrotik/heartbeat"
:local id "78957cd3-7096-4acd-970b-0aa0a768c555"
:local token "mtk_241ca9a5_cb1f8255"
:local version [/system resource get version]
:local uptime [/system resource get uptime]
:local json "{\"mikrotik_id\":\"$id\",\"token\":\"$token\",\"version\":\"$version\",\"uptime\":\"$uptime\"}"
:do {
[/tool fetch url=$url http-method=post http-header-field="Content-Type:application/json" http-data=$json]
} on-error={} 