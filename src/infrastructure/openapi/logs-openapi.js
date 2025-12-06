/**
 * OpenAPI configuration for Logs API
 * Only exposes logs-related endpoints for API documentation
 */
const logsOpenApiConfig = {
  hideUntagged: true,
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'Log Ingestion Platform - Logs API',
      description: 'API documentation for log ingestion and retrieval endpoints',
      version: '1.0.0',
      contact: {
        name: 'Log Ingestion Platform Team'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'http://localhost:3001',
        description: 'HTTP/2 server'
      },
      {
        url: 'http://localhost:3002',
        description: 'HTTP/3 server'
      }
    ],
    tags: [
      {
        name: 'logs',
        description: 'Log ingestion and retrieval operations'
      }
    ],
    components: {
      schemas: {
        LogEntry: {
          type: 'object',
          required: ['app_id', 'message', 'source'],
          properties: {
            app_id: {
              type: 'string',
              maxLength: 100,
              description: 'Application identifier',
              example: 'my-app-123'
            },
            level: {
              type: 'string',
              enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
              description: 'Log level',
              example: 'INFO'
            },
            message: {
              type: 'string',
              maxLength: 10000,
              description: 'Log message content',
              example: 'User login successful'
            },
            source: {
              type: 'string',
              maxLength: 255,
              description: 'Source of the log entry',
              example: 'auth-service'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 timestamp',
              example: '2023-12-06T12:00:00.000Z'
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata for the log entry',
              example: {
                userId: '12345',
                sessionId: 'abc-123',
                ip: '192.168.1.1'
              }
            }
          }
        },
        LogBatch: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/LogEntry'
          },
          description: 'Array of log entries for batch ingestion'
        },
        IngestResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Logs processed successfully'
            },
            stats: {
              type: 'object',
              properties: {
                accepted: {
                  type: 'number',
                  description: 'Number of accepted log entries',
                  example: 95
                },
                rejected: {
                  type: 'number',
                  description: 'Number of rejected log entries',
                  example: 5
                },
                throughput: {
                  type: 'string',
                  description: 'Processing throughput information',
                  example: '950 logs/sec'
                },
                validationStrategy: {
                  type: 'string',
                  description: 'Validation strategy used',
                  example: 'batch'
                },
                workerThreads: {
                  type: 'boolean',
                  description: 'Whether worker threads were used',
                  example: true
                }
              }
            }
          }
        },
        GetLogsResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Logs retrieved successfully'
            },
            data: {
              type: 'object',
              description: 'Query result data containing log entries',
              properties: {
                total: {
                  type: 'number',
                  description: 'Total number of log entries',
                  example: 1250
                },
                limit: {
                  type: 'number',
                  description: 'Limit applied to the query',
                  example: 1000
                },
                logs: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/LogEntry'
                  },
                  description: 'Array of log entries'
                }
              }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Validation failed'
            },
            errors: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of error messages',
              example: ['app_id is required', 'message cannot be empty']
            }
          }
        },
        BadRequestResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Invalid request parameters'
            },
            error: {
              type: 'string',
              example: 'Invalid app_id format'
            }
          }
        }
      },
      securitySchemes: {
        // Add security schemes if authentication is added later
        // ApiKeyAuth: {
        //   type: 'apiKey',
        //   in: 'header',
        //   name: 'X-API-Key'
        // }
      }
    },
    security: [
      // Add global security requirements if authentication is added later
      // { ApiKeyAuth: [] }
    ]
  }
};

module.exports = logsOpenApiConfig;
