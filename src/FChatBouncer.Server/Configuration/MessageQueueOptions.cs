namespace FChatBouncer.Server.Configuration;

public class MessageQueueOptions
{
    public StreamSettings Streams { get; set; } = new();
    public MonitoringSettings Monitoring { get; set; } = new();

    public class StreamSettings
    {
        public RetentionPolicySettings RetentionPolicy { get; set; } = new();
        public int ConsumerBatchSize { get; set; } = 100;
        public int ConsumerGroupCleanupAgeHours { get; set; } = 720;
        public int PelMaxRetries { get; set; } = 3;
        public int PelRetryDelayMs { get; set; } = 5000;
        public int TrimIntervalMinutes { get; set; } = 15;
    }

    public class RetentionPolicySettings
    {
        public int MaxMessages { get; set; } = 100_000;
        public int MaxAgeHours { get; set; } = 168;
    }

    public class MonitoringSettings
    {
        public bool EnableStreamSizeTracking { get; set; } = true;
        public bool EnableConsumerLagTracking { get; set; } = true;
        public int CheckIntervalSeconds { get; set; } = 300;
    }
}

