#!/bin/sh
# Substitute environment variables in the Alertmanager config template
# Alertmanager does not natively support ${VAR} interpolation in its YAML config
envsubst < /etc/alertmanager/alertmanager.yml.tpl > /etc/alertmanager/alertmanager.yml
exec /bin/alertmanager "$@"
