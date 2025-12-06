// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var proto_logs_logs_pb = require('../../proto/logs/logs_pb.js');
var proto_logs_log$entry_pb = require('../../proto/logs/log-entry_pb.js');

function serialize_logs_GetLogsByAppIdRequest(arg) {
  if (!(arg instanceof proto_logs_logs_pb.GetLogsByAppIdRequest)) {
    throw new Error('Expected argument of type logs.GetLogsByAppIdRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_GetLogsByAppIdRequest(buffer_arg) {
  return proto_logs_logs_pb.GetLogsByAppIdRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_logs_GetLogsByAppIdResponse(arg) {
  if (!(arg instanceof proto_logs_logs_pb.GetLogsByAppIdResponse)) {
    throw new Error('Expected argument of type logs.GetLogsByAppIdResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_GetLogsByAppIdResponse(buffer_arg) {
  return proto_logs_logs_pb.GetLogsByAppIdResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_logs_HealthCheckRequest(arg) {
  if (!(arg instanceof proto_logs_logs_pb.HealthCheckRequest)) {
    throw new Error('Expected argument of type logs.HealthCheckRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_HealthCheckRequest(buffer_arg) {
  return proto_logs_logs_pb.HealthCheckRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_logs_HealthCheckResponse(arg) {
  if (!(arg instanceof proto_logs_logs_pb.HealthCheckResponse)) {
    throw new Error('Expected argument of type logs.HealthCheckResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_HealthCheckResponse(buffer_arg) {
  return proto_logs_logs_pb.HealthCheckResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_logs_IngestLogsRequest(arg) {
  if (!(arg instanceof proto_logs_logs_pb.IngestLogsRequest)) {
    throw new Error('Expected argument of type logs.IngestLogsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_IngestLogsRequest(buffer_arg) {
  return proto_logs_logs_pb.IngestLogsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_logs_IngestLogsResponse(arg) {
  if (!(arg instanceof proto_logs_logs_pb.IngestLogsResponse)) {
    throw new Error('Expected argument of type logs.IngestLogsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_logs_IngestLogsResponse(buffer_arg) {
  return proto_logs_logs_pb.IngestLogsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Log Service - Handles log ingestion and retrieval
var LogServiceService = exports.LogServiceService = {
  // Ingest a single log or batch of logs
ingestLogs: {
    path: '/logs.LogService/IngestLogs',
    requestStream: false,
    responseStream: false,
    requestType: proto_logs_logs_pb.IngestLogsRequest,
    responseType: proto_logs_logs_pb.IngestLogsResponse,
    requestSerialize: serialize_logs_IngestLogsRequest,
    requestDeserialize: deserialize_logs_IngestLogsRequest,
    responseSerialize: serialize_logs_IngestLogsResponse,
    responseDeserialize: deserialize_logs_IngestLogsResponse,
  },
  // Query logs by app_id
getLogsByAppId: {
    path: '/logs.LogService/GetLogsByAppId',
    requestStream: false,
    responseStream: false,
    requestType: proto_logs_logs_pb.GetLogsByAppIdRequest,
    responseType: proto_logs_logs_pb.GetLogsByAppIdResponse,
    requestSerialize: serialize_logs_GetLogsByAppIdRequest,
    requestDeserialize: deserialize_logs_GetLogsByAppIdRequest,
    responseSerialize: serialize_logs_GetLogsByAppIdResponse,
    responseDeserialize: deserialize_logs_GetLogsByAppIdResponse,
  },
  // Health check
healthCheck: {
    path: '/logs.LogService/HealthCheck',
    requestStream: false,
    responseStream: false,
    requestType: proto_logs_logs_pb.HealthCheckRequest,
    responseType: proto_logs_logs_pb.HealthCheckResponse,
    requestSerialize: serialize_logs_HealthCheckRequest,
    requestDeserialize: deserialize_logs_HealthCheckRequest,
    responseSerialize: serialize_logs_HealthCheckResponse,
    responseDeserialize: deserialize_logs_HealthCheckResponse,
  },
};

exports.LogServiceClient = grpc.makeGenericClientConstructor(LogServiceService, 'LogService');
