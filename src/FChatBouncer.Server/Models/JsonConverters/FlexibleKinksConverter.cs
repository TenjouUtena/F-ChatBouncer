using System.Text.Json;
using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models.JsonConverters;

/// <summary>
/// Custom JSON converter for Kinks dictionary that can handle both simple string values
/// and complex objects with name, description, choice, and children properties.
/// This handles cases where the F-List API returns kinks in different formats.
/// </summary>
public class FlexibleKinksConverter : JsonConverter<Dictionary<string, string>>
{
    public override Dictionary<string, string> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var result = new Dictionary<string, string>();

        if (reader.TokenType == JsonTokenType.Null)
        {
            return result;
        }

        if (reader.TokenType == JsonTokenType.StartArray)
        {
            // If it's an array (like "kinks":[]), read through the array and return empty dictionary
            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndArray)
                {
                    break;
                }
            }
            return result;
        }

        if (reader.TokenType != JsonTokenType.StartObject)
        {
            // If it's not an object, return empty dictionary instead of throwing
            return result;
        }

        try
        {
            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndObject)
                {
                    break;
                }

                if (reader.TokenType == JsonTokenType.PropertyName)
                {
                    var propertyName = reader.GetString();
                    if (string.IsNullOrEmpty(propertyName))
                    {
                        reader.Read(); // Skip the value
                        continue;
                    }

                    reader.Read(); // Move to the value

                    try
                    {
                        // Handle different value types
                        switch (reader.TokenType)
                        {
                            case JsonTokenType.String:
                                // Simple string value (preference level)
                                var stringValue = reader.GetString();
                                if (!string.IsNullOrEmpty(stringValue))
                                {
                                    result[propertyName] = stringValue;
                                }
                                break;

                            case JsonTokenType.StartObject:
                                // Complex object - extract the "choice" field as the preference level
                                using (var doc = JsonDocument.ParseValue(ref reader))
                                {
                                    if (doc.RootElement.TryGetProperty("choice", out var choiceElement))
                                    {
                                        var choice = choiceElement.GetString();
                                        if (!string.IsNullOrEmpty(choice))
                                        {
                                            result[propertyName] = choice;
                                        }
                                    }
                                }
                                break;

                            case JsonTokenType.Null:
                                // Skip null values
                                break;

                            default:
                                // For any other type, try to get string representation
                                var value = reader.GetString();
                                if (!string.IsNullOrEmpty(value))
                                {
                                    result[propertyName] = value;
                                }
                                break;
                        }
                    }
                    catch (JsonException)
                    {
                        // If we can't deserialize this specific kink, skip it
                        // and continue with the rest of the dictionary
                        continue;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // If the entire kinks object is malformed, return empty dictionary
            // This prevents the entire character data deserialization from failing
            return new Dictionary<string, string>();
        }

        return result;
    }

    public override void Write(Utf8JsonWriter writer, Dictionary<string, string> value, JsonSerializerOptions options)
    {
        JsonSerializer.Serialize(writer, value, options);
    }
}
