#!/bin/bash
set -euo pipefail

case "$1" in
    start)
        echo "Starting application..."
        docker compose up --build -d
        ;;

    stop)
        echo "Stopping application..."
        docker compose down
        ;;

    restart)
        echo "Restarting application..."
        docker compose down
        docker compose up --build -d
        ;;

    status)
        echo "Application Status:"
        docker compose ps
        ;;

    *)
        echo "Usage: ./deploy.sh {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
