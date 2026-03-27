package main

import (
	"log"
	"project-name/internal/api"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Gin engine
	r := gin.Default()

	// Register the health check endpoint
	r.GET("/health", api.HealthHandler)

	// Start the server on port 8080
	port := "8080"
	log.Printf("Server starting on port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
