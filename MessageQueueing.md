# Message Queueing Architecture for F-ChatBouncer

## Overview

This document defines the architecture for implementing a **persistent message queue** for messages that flow through the SignalR tunnel. Each User Agent must maintain its own position in the queue, enabling message replay, recovery from disconnections, and reliable delivery.

---

## Requirements Analysis

### Functional Requirements
1. **Persistent Storage**: Messages must survive server restarts and reconnections
2. **Per-Consumer Offset Tracking**: Each User Agent tracks its own read position independently
3. **Message Ordering**: Messages within a stream must maintain order
4. **Delivery Guarantees**: At-least-once delivery semantics
5. **Message Replay**: Ability to request missed messages when reconnecting
6. **Multi-Channel Support**: Different message streams for different channels/rooms
7. **Scalability**: Support for many concurrent consumers with independent positions

### Non-Functional Requirements
1. **Low Latency**: Real-time message delivery (< 100ms for typical messages)
2. **High Throughput**: Handle high volume of messages (1000s/sec)
3. **Durability**: No message loss
4. **Consumer Isolation**: One consumer's lag doesn't affect others
5. **Simple Operational Model**: Should not require Kafka-level complexity for basic use case

---

## Redis Streams Architecture

### System Design

#### 1. **Stream Structure**

```csharp
// Stream naming conventions:
"chat:messages:room:{roomId}"           // Messages in a room
"chat:messages:dm:{senderId}:{recipientId}"  // Direct messages
"chat:system:events"                     // System-wide events
```

#### 2. **Message Format**

```csharp
[StreamMessage]
{
  "id": "1699873641000-0",              // Redis auto-generated stream ID
  "type": "user_message",                // Message type
  "timestamp": 1699873641000,
  "senderId": "user-123",
  "senderCharacterId": "char-456",
  "content": "Hello, world!",
  "roomId": "room-789",
  "metadata": {
    "clientVersion": "2.1.0",
    "deliveryTag": "msg-uuid-abc"
  }
}
```

#### 3. **Consumer Groups (Per User Agent)**

Each User Agent has a consumer group per stream it cares about:

```csharp
// Consumer Group: "user-agent-{agentId}:room:{roomId}"
// Tracks:
//   - Pending Entry List (PEL): Messages delivered but not acknowledged
//   - Last delivered ID: Position where this consumer left off
//   - Per-consumer info: Last heartbeat, etc.
```

#### 4. **Message Flow**

```
┌─────────────┐
│  F-Chat WS  │
│  Connection │
└──────┬──────┘
       │ Message received
       ▼
┌──────────────────────────┐
│  FChatService            │
│  (Message Processing)    │
└──────┬───────────────────┘
       │ Publish to stream
       ▼
┌──────────────────────────────────────┐
│  Redis Stream                         │
│  "chat:messages:room:123"            │
│                                      │
│  [msg1] [msg2] [msg3] [msg4] [msg5] │
└──────┬───────────────────────────────┘
       │
       ├─ Consumer: user-agent-A (read up to msg3, offset: msg3)
       ├─ Consumer: user-agent-B (read up to msg1, offset: msg1)
       └─ Consumer: user-agent-C (read up to msg5, offset: msg5)

       Each gets its own view of "unread" messages
```

#### 5. **Consumer Offset Management**

For each User Agent connecting to a room:

```csharp
// Flow:
1. User Agent connects to room
2. Query consumer group for last offset: XINFO CONSUMERS group {groupName}
3. If no offset exists, create consumer and start from latest (XREADGROUP)
4. Pull new messages since that offset
5. Acknowledge messages as they're delivered to client: XACK
```

#### 6. **Message Delivery Semantics**

- **At-Least-Once Delivery**: Messages are acknowledged only after confirmed delivery
- **Idempotency**: Client deduplicates via message ID/delivery tag
- **Replay on Reconnect**: If agent goes down, query PEL for unacknowledged messages first

#### 7. **Retention Policy**

```csharp
// Default: Keep last 7 days or 100,000 messages, whichever comes first
XTRIM chat:messages:room:123 MINID ~ 1699700000000

// Or length-based:
XTRIM chat:messages:room:123 MAXLEN ~ 100000
```

---

## Implementation Architecture

### Component Structure

```
/src/FChatBouncer.Server/
├── MessageQueue/
│   ├── IMessageQueue.cs                 // Abstraction
│   ├── RedisStreamMessageQueue.cs       // Redis Streams implementation
│   ├── MessageStreamEntry.cs            // DTO for stream entries
│   ├── StreamMessage.cs                 // Base message class
│   └── StreamConsumerGroup.cs           // Consumer group management
│
├── Services/
│   ├── IMessageQueueService.cs          // High-level service interface
│   ├── MessageQueueService.cs           // Implementation
│   ├── MessagePublisher.cs              // Publishes messages to streams
│   └── MessageSubscriber.cs             // Subscribes to streams
│
├── BackgroundServices/
│   ├── StreamCleanupService.cs          // Retention policy enforcement
│   ├── StreamMonitoringService.cs       // Monitor stream health
│   └── PendingEntryListProcessor.cs     // Retry unacknowledged messages
│
├── Models/
│   ├── StreamMessage.cs                 // Message model
│   ├── ConsumerOffset.cs                // Track consumer positions
│   └── StreamMetrics.cs                 // Health metrics
│
└── Hubs/
    └── BouncerHub.cs                    // Updated to use message queue
```

### Key Interfaces

#### 1. **Message Queue Interface**

```csharp
public interface IMessageQueue
{
    // Publishing
    Task<string> PublishMessageAsync(
        string streamKey,
        StreamMessage message,
        CancellationToken cancellationToken = default);

    // Consuming
    Task<IReadOnlyList<StreamMessageEntry>> ReadMessagesAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        int batchSize = 100,
        CancellationToken cancellationToken = default);

    // Offset Management
    Task<string> GetConsumerOffsetAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        CancellationToken cancellationToken = default);

    Task AcknowledgeMessageAsync(
        string streamKey,
        string consumerGroupName,
        string messageId,
        CancellationToken cancellationToken = default);

    // Replay
    Task<IReadOnlyList<StreamMessageEntry>> GetMessagesAfterIdAsync(
        string streamKey,
        string afterId,
        int limit = 100,
        CancellationToken cancellationToken = default);

    // Retention
    Task TrimStreamAsync(
        string streamKey,
        int maxMessages,
        CancellationToken cancellationToken = default);
}
```

#### 2. **Message Queue Service**

```csharp
public interface IMessageQueueService
{
    // Channel-specific operations
    Task PublishRoomMessageAsync(
        string roomId,
        string senderId,
        string characterId,
        string content,
        CancellationToken cancellationToken = default);

    Task PublishDirectMessageAsync(
        string senderId,
        string recipientId,
        string content,
        CancellationToken cancellationToken = default);

    Task PublishSystemEventAsync(
        string eventType,
        object data,
        CancellationToken cancellationToken = default);

    // Consumption
    Task<IReadOnlyList<StreamMessage>> GetRoomMessagesAsync(
        string roomId,
        string userAgentId,
        string userId,
        int batchSize = 100,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessage>> GetMissedMessagesAsync(
        string userAgentId,
        string userId,
        CancellationToken cancellationToken = default);

    // Acknowledgment
    Task AcknowledgeMessageAsync(
        string messageId,
        string userAgentId,
        CancellationToken cancellationToken = default);
}
```

---

## Stream Naming Conventions

```
chat:messages:room:{roomId}              // Room messages
chat:messages:dm:{userId1}:{userId2}    // Direct messages (lexicographically sorted user IDs)
chat:system:events                       // System-wide events
chat:system:connections                 // Connection events
```

**Consumer Group Naming:**
```
user-agent:{agentId}:room:{roomId}      // User agent in specific room
user-agent:{agentId}:dm:{userId}        // Direct message conversations
```

---

## Offset Tracking Strategy

### Scenario 1: User Agent Connects Fresh
```
1. Generate unique agentId (UUID)
2. Create consumer group if not exists
3. Use "$" to start from latest messages
4. Only receive new messages from this point
```

### Scenario 2: User Agent Reconnects
```
1. Same agentId identifies agent
2. Query last offset from XINFO CONSUMERS
3. Check PEL (Pending Entry List) for unacked messages
4. Deliver unacked messages first
5. Then deliver messages after last offset
```

### Scenario 3: User Missed Messages
```
1. If agent was offline, messages accumulated in stream
2. On reconnect, deliver all missed messages since last offset
3. Optional: Limit to last N hours to avoid overwhelming client
```

---

## Delivery Guarantees

### Current (Without Queue)
```
User connects → Server sends current state → Updates as they occur
Problem: If disconnection happens, messages are lost
```

### With Redis Streams
```
User connects → Query offset → Get all messages since last position → Deliver
Problem: User gets caught up automatically on reconnection
Solution: At-least-once delivery + client-side deduplication
```

### Implementation
```csharp
// Message structure includes delivery metadata
{
  "id": "1699873641000-0",              // Redis ID - unique
  "deliveryTag": "uuid-abc",            // Application-level unique ID
  "content": "...",
  "timestamp": 1699873641000
}

// Client-side deduplication:
// Store seen deliveryTag values in a Set
// Ignore duplicates if redelivered
```

---

## Phase 4.2: Implementation Plan

### Task 4.2a: Design & Setup Redis Streams Infrastructure
**Priority**: High | **Estimated Time**: 4-6 hours

- [ ] Create message models and stream entry DTOs
  - [ ] `StreamMessage` base class
  - [ ] `RoomMessage`, `DirectMessage`, `SystemEvent` classes
  - [ ] `StreamMessageEntry` for Redis XREAD results

- [ ] Design stream naming conventions and key structures
  - [ ] Document all stream key patterns
  - [ ] Define message schemas (JSON structure in stream)
  - [ ] Define consumer group naming conventions

- [ ] Create Redis Stream utilities
  - [ ] Connection management
  - [ ] Stream ID helpers
  - [ ] Message serialization (JSON)

**Files to Create:**
- `/src/FChatBouncer.Server/MessageQueue/StreamMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/RoomMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/DirectMessage.cs`
- `/src/FChatBouncer.Server/MessageQueue/SystemEvent.cs`
- `/src/FChatBouncer.Server/MessageQueue/StreamMessageEntry.cs`
- `/src/FChatBouncer.Server/MessageQueue/StreamKeys.cs` (constants)
- `/src/FChatBouncer.Server/MessageQueue/StreamIdHelper.cs`

---

### Task 4.2b: Implement Core Message Queue
**Priority**: High | **Estimated Time**: 8-10 hours

- [ ] Create message queue abstraction
  - [ ] `IMessageQueue` interface
  - [ ] `RedisStreamMessageQueue` implementation
  - [ ] Handle all XADD, XREAD, XACK, XINFO operations

- [ ] Implement publishing
  - [ ] Publish room messages
  - [ ] Publish direct messages
  - [ ] Publish system events
  - [ ] Handle message serialization

- [ ] Implement consuming
  - [ ] XREADGROUP for consumer groups
  - [ ] Create consumer groups on demand
  - [ ] Handle message deserialization
  - [ ] Track consumer offsets

- [ ] Implement acknowledgment
  - [ ] XACK for confirmed delivery
  - [ ] PEL (Pending Entry List) monitoring
  - [ ] Retry logic for unacknowledged messages

**Files to Create:**
- `/src/FChatBouncer.Server/MessageQueue/IMessageQueue.cs`
- `/src/FChatBouncer.Server/MessageQueue/RedisStreamMessageQueue.cs`

---

### Task 4.2c: Create High-Level Message Service
**Priority**: High | **Estimated Time**: 6-8 hours

- [ ] Design message queue service layer
  - [ ] `IMessageQueueService` interface
  - [ ] `MessageQueueService` implementation

- [ ] Implement room message operations
  - [ ] Publish to room
  - [ ] Get room messages
  - [ ] Acknowledge room messages

- [ ] Implement direct message operations
  - [ ] Publish direct messages
  - [ ] Get direct message conversations
  - [ ] Acknowledge direct messages

- [ ] Implement reconnection logic
  - [ ] Get missed messages on reconnect
  - [ ] Replay from specific offset
  - [ ] Handle PEL (redelivery)

**Files to Create:**
- `/src/FChatBouncer.Server/Services/IMessageQueueService.cs`
- `/src/FChatBouncer.Server/Services/MessageQueueService.cs`

---

### Task 4.2d: Integrate with SignalR Hub
**Priority**: High | **Estimated Time**: 6-8 hours

- [ ] Update BouncerHub to use message queue
  - [ ] On user joining room: Register consumer group + get messages
  - [ ] On message from F-Chat: Publish to stream
  - [ ] On client disconnect: Persist offset (don't cleanup)
  - [ ] On client reconnect: Retrieve from offset

- [ ] Implement flow control
  - [ ] Batch message delivery to clients
  - [ ] Handle backpressure from slow clients
  - [ ] Rate limiting to prevent overwhelming connections

- [ ] Add deduplication support
  - [ ] Client tracks delivery tags
  - [ ] Server retries on failed ACK
  - [ ] Idempotent client-side handling

**Files to Update:**
- `/src/FChatBouncer.Server/Hubs/BouncerHub.cs`

---

### Task 4.2e: Background Services & Cleanup
**Priority**: Medium | **Estimated Time**: 4-6 hours

- [ ] Create stream retention cleanup service
  - [ ] Trim old messages based on TTL/max length
  - [ ] Run periodically (hourly or daily)
  - [ ] Configurable retention policy

- [ ] Create stream monitoring service
  - [ ] Monitor stream sizes
  - [ ] Track consumer lag
  - [ ] Alert on anomalies

- [ ] Implement PEL monitoring
  - [ ] Check for stale messages in pending list
  - [ ] Attempt redelivery with backoff
  - [ ] Dead letter queue for permanently failed messages

**Files to Create:**
- `/src/FChatBouncer.Server/BackgroundServices/StreamRetentionService.cs`
- `/src/FChatBouncer.Server/BackgroundServices/StreamMonitoringService.cs`
- `/src/FChatBouncer.Server/BackgroundServices/PendingEntryListProcessor.cs`

---

### Task 4.2f: Testing & Validation
**Priority**: High | **Estimated Time**: 8-10 hours

- [ ] Unit tests
  - [ ] Message publication tests
  - [ ] Consumer group offset tests
  - [ ] Message replay tests
  - [ ] Deduplication tests

- [ ] Integration tests
  - [ ] Multi-user scenarios
  - [ ] Reconnection scenarios
  - [ ] Stream retention cleanup

- [ ] Load tests
  - [ ] High message volume
  - [ ] Many concurrent consumers
  - [ ] Large stream sizes (millions of messages)

- [ ] Manual testing
  - [ ] Disconnect/reconnect flow
  - [ ] Verify offset tracking
  - [ ] Verify message order

**Files to Create:**
- `/src/FChatBouncer.Server/Tests/MessageQueueTests.cs`
- `/src/FChatBouncer.Server/Tests/ConsumerGroupTests.cs`
- `/src/FChatBouncer.Server/Tests/RedisStreamIntegrationTests.cs`

---

### Task 4.2g: Documentation & Configuration
**Priority**: Medium | **Estimated Time**: 2-3 hours

- [ ] Add configuration options
  - [ ] Stream retention policy (TTL / max messages)
  - [ ] Consumer group cleanup behavior
  - [ ] Batch sizes and timeouts

- [ ] Document operational procedures
  - [ ] Monitoring dashboards
  - [ ] Stream size monitoring
  - [ ] Consumer lag monitoring
  - [ ] Debugging commands

- [ ] Add metrics/observability
  - [ ] Messages published per stream
  - [ ] Messages consumed per consumer group
  - [ ] Consumer lag per consumer
  - [ ] PEL size

**Files to Update:**
- `/appsettings.json` (add configuration section)
- `backend.md` (update with actual implementation)
- New file: `/docs/MessageQueueing-Operational-Guide.md`

---

## Configuration Example

```json
{
  "MessageQueue": {
    "Redis": {
      "ConnectionString": "localhost:6379"
    },
    "Streams": {
      "RetentionPolicy": {
        "MaxMessages": 100000,
        "MaxAgeHours": 168
      },
      "ConsumerBatchSize": 100,
      "ConsumerGroupCleanupAgeHours": 720,
      "PelMaxRetries": 3,
      "PelRetryDelayMs": 5000
    },
    "Monitoring": {
      "EnableStreamSizeTracking": true,
      "EnableConsumerLagTracking": true,
      "CheckIntervalSeconds": 300
    }
  }
}
```

---

## Database Considerations

### Keep in PostgreSQL
- Message history archival (older than stream retention)
- User read receipts and message interactions (likes, edits)
- Full-text search index over messages
- Chat logs for user compliance/reporting

### Move to Redis Streams
- Live message delivery
- Consumer offset tracking
- Pending acknowledgment state

### Sync Strategy
```
PostgreSQL                    Redis Streams
   ↓                              ↑
Message archive               Live delivery
(older than TTL)         (current window)
   ↑                              ↓
Periodic archival job    On TTL expiry
```

---

## Implementation Strategy

Since there is no production instance, we will implement Redis Streams directly without maintaining legacy code paths or parallel migration.

### Direct Implementation
1. Implement Redis Streams infrastructure from scratch
2. Update FChatService to use message queues
3. Integrate with SignalR Hub for real-time delivery
4. Implement background services for stream management
5. Comprehensive testing before deployment

### No Legacy Code Path
- No parallel Pub/Sub implementation
- No gradual migration phase
- Clean implementation focused on Redis Streams from the start
- This allows for a simpler, more maintainable codebase

---

## Success Criteria

✅ User agents can disconnect and reconnect without losing messages
✅ Each user agent independently tracks its read position
✅ Messages are delivered in order within a stream
✅ No duplicate messages on client (with deduplication)
✅ Old messages automatically cleaned up per policy
✅ System handles thousands of concurrent consumers
✅ Latency < 100ms for message delivery
✅ Dashboard shows stream health and consumer lag

---

## Next Steps

1. ✅ Architecture design complete
2. ⏭️ Start with Task 4.2a (Design & Setup)
3. ⏭️ Implement tasks 4.2a through 4.2g in order
4. ⏭️ Test thoroughly before deployment
