# Makefile for Project Name

# Variables
APP_NAME := project-name
VERSION := 1.0.0

# Build the application
build:
	go build -o bin/${APP_NAME} cmd/api/main.go

# Run the application
run:
	go run cmd/api/main.go

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/

# Install dependencies
deps:
	go mod tidy

# Run linter
lint:
	golangci-lint run

# Build Docker image
docker-build:
	docker build -t ${APP_NAME}:${VERSION} .

# Help documentation
help:
	@echo "Available commands:"
	@echo "  build        - Build the application"
	@echo "  run          - Run the application"
	@echo "  test         - Run tests"
	@echo "  clean        - Clean build artifacts"
	@echo "  deps         - Install dependencies"
	@echo "  lint         - Run linter"
	@echo "  docker-build - Build Docker image"
	@echo "  help         - Show this help message"

.PHONY: build run test clean deps lint docker-build help