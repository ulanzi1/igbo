#!/bin/sh
# Substitute environment variables in the Prometheus config template
# Prometheus does not natively support ${VAR} interpolation in its YAML config
envsubst < /etc/prometheus/prometheus.yml.tpl > /etc/prometheus/prometheus.yml
exec /bin/prometheus "$@"
