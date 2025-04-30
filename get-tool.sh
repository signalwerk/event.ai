#!/bin/bash

# exit on error
set -e

# Configuration
# MODEL="google/gemma-3-27b-it:free"
# MODEL="mistralai/mistral-small-3.1-24b-instruct:free"
# MODEL="mistralai/mistral-7b-instruct:free"
MODEL="google/gemini-2.0-flash-exp:free"
MAX_TOKENS=2200
PROMPT_FILE="test5.md"

# Check if prompt file or .env exists
if [ ! -f "$PROMPT_FILE" ] || [ ! -f .env ]; then
  echo "Error: $PROMPT_FILE or .env file not found"
  exit 1
fi

# Extract model name - take part after '/' and before ':'
MODEL_NAME=$(echo "$MODEL" | cut -d'/' -f2 | cut -d':' -f1)
# If no '/' found, use first part before ':'
if [ "$MODEL_NAME" = "" ]; then
    MODEL_NAME=$(echo "$MODEL" | cut -d':' -f1)
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${TIMESTAMP}__${MODEL_NAME}"

JSON_CONTENT=$(jq -sRr @json < "$PROMPT_FILE")
API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d '=' -f2)

# Execute API request and prettify JSON output
# Free limit: If you are using a free model variant (with an ID ending in :free), then you will be limited to 20 requests per minute and 200 requests per day.
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  --data @- > "DATA/${OUTPUT_FILE}.json" << EOF
{
  "model": "${MODEL}",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": ${JSON_CONTENT}
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "extract_events_info",
        "description": "Extracts multiple events information from text and returns them as structured data.",
        "parameters": {
          "type": "object",
          "properties": {
            "events": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string",
                    "description": "Title of the event. Never include 'event' in the title. It is redundant. Also, the title should be short and descriptive. Don't include the date or time or location in the title."
                  },
                  "start": {
                    "type": "string",
                    "description": "Event start date and time in YYYYMMDDTHHMMSS format"
                  },
                  "end": {
                    "type": "string",
                    "description": "Event end date and time in YYYYMMDDTHHMMSS format"
                  },
                  "place": {
                    "type": "string",
                    "description": "Location of the event. Name of the location and address. Newline separated."
                  },
                  "url": {
                    "type": "string",
                    "description": "URL of the event or the location."
                  },
                  "notes": {
                    "type": "string",
                    "description": "Additional notes about the event or additional information and details. Additional URLs, contact information, etc."
                  }
                },
                "required": ["title", "start", "end"]
              }
            }
          },
          "required": ["events"]
        }
      }
    }
  ],
  "tool_choice": "required"
}
EOF

# Add jq formatting to the output file
jq '.' "DATA/${OUTPUT_FILE}.json" > "DATA/${OUTPUT_FILE}.tmp" && mv "DATA/${OUTPUT_FILE}.tmp" "DATA/${OUTPUT_FILE}.json"

# Extract response text to a separate file
jq -r '.choices[0].message.tool_calls[0].function.arguments' "DATA/${OUTPUT_FILE}.json" | jq '.' > "DATA/${OUTPUT_FILE}-call.json"

echo "Response saved to $OUTPUT_FILE"
