using System.Text.Json;
using System.Text.Json.Serialization;

namespace FChatBouncer.Server.Models.JsonConverters;

/// <summary>
/// Custom JSON converter for CustomKinks dictionary that can handle malformed JSON structures.
/// This handles cases where the F-List API returns custom_kinks in unexpected formats.
/// </summary>
public class FlexibleCustomKinksConverter : JsonConverter<Dictionary<string, CustomKink>>
{
    public override Dictionary<string, CustomKink> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var result = new Dictionary<string, CustomKink>();

        if (reader.TokenType == JsonTokenType.Null)
        {
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
                        var customKink = JsonSerializer.Deserialize<CustomKink>(ref reader, options);
                        if (customKink != null)
                        {
                            result[propertyName] = customKink;
                        }
                    }
                    catch (JsonException)
                    {
                        // If we can't deserialize this specific custom kink, skip it
                        // and continue with the rest of the dictionary
                        continue;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // If the entire custom_kinks object is malformed, return empty dictionary
            // This prevents the entire character data deserialization from failing
            return new Dictionary<string, CustomKink>();
        }

        return result;
    }

    public override void Write(Utf8JsonWriter writer, Dictionary<string, CustomKink> value, JsonSerializerOptions options)
    {
        JsonSerializer.Serialize(writer, value, options);
    }
}

