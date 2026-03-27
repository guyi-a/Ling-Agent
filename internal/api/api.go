package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthResponse represents the response structure for the health check endpoint.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// HealthHandler handles the health check request using Gin context.
func HealthHandler(c *gin.Context) {
	response := HealthResponse{
		Status:  "UP",
		Version: "1.0.0",
	}

	c.JSON(http.StatusOK, response)
}
