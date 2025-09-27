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
                
                if (int.TryParse(stringValue, out var intValue))
                    return intValue;
                
                // If string cannot be parsed as int, return null instead of throwing
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

