/system scheduler add name="pix-verificador-scheduler" start-time=startup interval=40s on-event="/system script run pix-verificador"
/system scheduler add name="pix-limpeza-scheduler" start-time=startup interval=2m on-event="/system script run pix-limpeza"
/system scheduler add name="pix-heartbeat-scheduler" start-time=startup interval=5m on-event="/system script run pix-heartbeat" 