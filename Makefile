.PHONY: dev dev-web dev-server build-server push

dev:
	concurrently -n web,server -c cyan,green "make dev-web" "make dev-server"

dev-web:
	cd apps/web && npm run dev

dev-server:
	cd apps/server && npm run dev

build-server:
	cd apps/server && npm run build

push:
	git add . && git commit -m "$(msg)" && git push
