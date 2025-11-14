namespace FChatBouncer.Server.MessageQueue;

public interface IMessageQueue
{
    Task<string> PublishMessageAsync(
        string streamKey,
        StreamMessage message,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessageEntry>> ReadMessagesAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        int batchSize = 100,
        CancellationToken cancellationToken = default);

    Task<string?> GetConsumerOffsetAsync(
        string streamKey,
        string consumerGroupName,
        string consumerId,
        CancellationToken cancellationToken = default);

    Task AcknowledgeMessageAsync(
        string streamKey,
        string consumerGroupName,
        string messageId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StreamMessageEntry>> GetMessagesAfterIdAsync(
        string streamKey,
        string afterId,
        int limit = 100,
        CancellationToken cancellationToken = default);

    Task TrimStreamAsync(
        string streamKey,
        int maxMessages,
        CancellationToken cancellationToken = default);
}

