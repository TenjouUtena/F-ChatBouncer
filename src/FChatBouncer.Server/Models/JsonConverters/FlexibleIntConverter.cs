using System.Text.Json;
using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models.JsonConverters;

/// <summary>
/// Custom JSON converter that can handle both string and integer values for nullable int properties.
/// This is useful for APIs that inconsistently return numeric values as strings or numbers.
/// </summary>
public class FlexibleIntConverter : JsonConverter<int?>
{
    public override int? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.Number:
                return reader.GetInt32();
            
            case JsonTokenType.String:
                var stringValue = reader.GetString();
                if (string.IsNullOrEmpty(stringValue))
                    return null;
                
                // Try direct integer parsing first
                if (int.TryParse(stringValue, out var intValue))
                    return intValue;
                
                // Handle timezone strings like "UTC-5", "UTC+8", "Zulu"
                if (stringValue.Equals("Zulu", StringComparison.OrdinalIgnoreCase))
                    return 0; // UTC is 0 offset
                
                if (stringValue.StartsWith("UTC", StringComparison.OrdinalIgnoreCase))
                {
                    var offsetPart = stringValue.Substring(3); // Remove "UTC" prefix
                    if (int.TryParse(offsetPart, out var offsetValue))
                        return offsetValue;
                }
                
                // If string cannot be parsed as int or timezone, return null instead of throwing
                return null;
            
            case JsonTokenType.Null:
                return null;
            
            default:
                // For any other token type, return null instead of throwing an exception
                return null;
        }
    }

    public override void Write(Utf8JsonWriter writer, int? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            writer.WriteNumberValue(value.Value);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}

