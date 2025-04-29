import {
  LitElement,
  html,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

// Use a placeholder for the timestamp that will be replaced before making actual API calls
const SYSTEM_PROMPT = `You are an assistant that extracts event information from text. The text may contain information about multiple events. Return all the events found in the text. Today's date and time are {{$now}}.`;

// Cache helper functions with SHA-256 hashing
async function sha256(source) {
  const sourceBytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
  const resultBytes = [...new Uint8Array(digest)];
  return resultBytes.map(x => x.toString(16).padStart(2, '0')).join("");
}

// Get current timestamp in ISO format
const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

// Replace placeholder with actual timestamp
const replacePlaceholders = (text) => {
  return text.replace("{{$now}}", getCurrentTimestamp());
};

// Simple cache key function using SHA-256
const getCacheKey = async (endpoint, body) => {
  // Sort object keys to ensure consistent serialization
  const sortedBody = JSON.stringify(body, Object.keys(body).sort());
  const hash = await sha256(endpoint + sortedBody);
  return `cache_${hash}`;
};

const getCachedResponse = (key) => {
  try {
    const cached = sessionStorage.getItem(key);
    console.log(`Cache lookup for key: ${key}, Found: ${Boolean(cached)}`);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error("Cache retrieval error:", error);
    return null;
  }
};

const setCachedResponse = (key, data) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
    console.log(`Cache set for key: ${key}`);
  } catch (error) {
    console.error("Cache storage error:", error);
  }
};

class EventConverter extends LitElement {
  static properties = {
    apiKey: { type: String },
    eventText: { type: String },
    selectedModel: { type: String },
    processing: { type: Boolean },
    previewData: { type: Object },
    icsBlob: { type: Object },
    icsUrl: { type: String },
  };

  constructor() {
    super();
    this.apiKey = localStorage.getItem("openai_api_key") ?? "";
    this.eventText = localStorage.getItem("event_text") ?? "";
    this.selectedModel =
      localStorage.getItem("selected_model") ?? "gpt-3.5-turbo";
    this.processing = false;
    this.previewData = null;
    this.icsBlob = null;
    this.icsUrl = "";
  }

  render() {
    return html`
      <!-- API Key Input -->
      <label for="apiKey">API Key:</label>
      <input
        type="password"
        id="apiKey"
        .value=${this.apiKey}
        @input=${(e) => {
          this.apiKey = e.target.value;
          localStorage.setItem("openai_api_key", this.apiKey);
        }}
        placeholder="Enter your OpenAI API Key"
      /><br /><br />

      <!-- Model Selection Dropdown -->
      <label for="modelSelect">Select Model:</label>
      <select
        id="modelSelect"
        .value=${this.selectedModel}
        @change=${(e) => {
          this.selectedModel = e.target.value;
          localStorage.setItem("selected_model", this.selectedModel);
        }}
      >
        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        <option value="gpt-4">gpt-4</option>
        <option value="gpt-4o-mini">gpt-4o-mini</option>
        <option value="gpt-4o">gpt-4o</option>
      </select>
      <br /><br />

      <!-- Event Text Input -->
      <label for="eventText">Event Text:</label><br />
      <textarea
        id="eventText"
        rows="10"
        cols="50"
        .value=${this.eventText}
        @input=${(e) => {
          this.eventText = e.target.value;
          localStorage.setItem("event_text", this.eventText);
        }}
        placeholder="Enter event details here..."
      ></textarea
      ><br /><br />

      <!-- Convert Button -->
      <button @click=${this.convertToICS}>Convert to ICS</button><br /><br />

      <!-- Processing Label -->
      ${this.processing
        ? html`<div class="processing-label">Processing...</div>`
        : ""}

      <!-- Preview Area -->
      <div class="preview">${this.renderPreview()}</div>

      <!-- Download Link -->
      ${this.icsUrl
        ? html`<a
            class="download-link"
            href=${this.icsUrl}
            download="events.ics"
            >Download ICS File</a
          >`
        : ""}
    `;
  }

  renderPreview() {
    if (!this.previewData) return "";

    return html`
      <h2>Select Event Data</h2>
      <form id="eventsDataForm" @submit=${(e) => e.preventDefault()}>
        <div class="table-container">
          ${this.renderGlobalOptions()}
          ${this.previewData.map((group, groupIndex) =>
            this.renderEventGroup(group, groupIndex),
          )}
        </div>

        <button type="button" @click=${this.generateICSFile}>
          Generate ICS File
        </button>
      </form>
    `;
  }

  renderGlobalOptions() {
    if (!this.previewData || !this.previewData.length) return "";

    const globalFields = ["title", "place", "notes"];

    return html`
      <div class="column">
        <h3>Global Options</h3>

        ${globalFields.map((field) => {
          const valuesSet = new Set();

          this.previewData.forEach((group) => {
            group.forEach((event) => {
              if (event[field]) {
                valuesSet.add(event[field]);
              }
            });
          });

          const values = Array.from(valuesSet);

          return html`
            <div class="grouped-options">
              <label>Select ${field} for all events:</label>
              ${values.map(
                (value, index) => html`
                  <div>
                    <input
                      type="radio"
                      name="global_${field}"
                      value=${value}
                      ?checked=${index === 0}
                      id="global_${field}_${index}"
                    />
                    <label for="global_${field}_${index}">${value}</label>
                  </div>
                `,
              )}
            </div>
          `;
        })}
      </div>
    `;
  }

  renderEventGroup(group, groupIndex) {
    return html`
      <div class="column">
        <h3>Event Group ${groupIndex + 1}</h3>

        <div style="margin-bottom: 10px;">
          <label>Start:</label>
          <input
            type="text"
            name="event_${groupIndex}_start"
            .value=${group[0].start}
          />
        </div>

        <div style="margin-bottom: 10px;">
          <label>End:</label>
          <input
            type="text"
            name="event_${groupIndex}_end"
            .value=${group[0].end}
          />
        </div>

        ${["title", "place", "url", "notes"].map((field) => {
          const valuesSet = new Set();

          group.forEach((event) => {
            if (event[field]) {
              valuesSet.add(event[field]);
            }
          });

          const values = Array.from(valuesSet);

          return html`
            <div class="grouped-options">
              <label>Select ${field}:</label>
              ${values.map(
                (value, index) => html`
                  <div>
                    <input
                      type="radio"
                      name="event_${groupIndex}_${field}"
                      value=${value}
                      ?checked=${index === 0}
                      id="event_${groupIndex}_${field}_${index}"
                    />
                    <label for="event_${groupIndex}_${field}_${index}"
                      >${value}</label
                    >
                  </div>
                `,
              )}
            </div>
          `;
        })}
      </div>
    `;
  }

  async convertToICS() {
    const apiKey = this.apiKey.trim();
    const eventText = this.eventText.trim();

    if (!apiKey || !eventText) {
      alert("Please enter both API Key and Event Text.");
      return;
    }

    // Start processing
    this.processing = true;
    this.previewData = null;
    this.icsUrl = "";
    this.requestUpdate();

    try {
      // Extract events
      const eventsData = await this.extractEvents(apiKey, eventText);

      if (eventsData.length > 0) {
        // Group events by start and end time
        this.previewData = this.groupEventsByStartEnd(eventsData);
      } else {
        alert("Failed to extract event information.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred: " + error.message);
    } finally {
      this.processing = false;
      this.requestUpdate();
    }
  }

  async extractEvents(apiKey, eventText) {
    const endpoint = "https://api.openai.com/v1/chat/completions";
    const body = {
      model: this.selectedModel,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        { role: "user", content: eventText },
      ],
      functions: [
        {
          name: "extract_events_info",
          description:
            "Extracts multiple events information from text and returns them as structured data.",
          parameters: {
            type: "object",
            properties: {
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description:
                        "Title of the event. Never include 'event' in the title. It is redundant. Also, the title should be short and descriptive. Don't include the date or time or location in the title.",
                    },
                    start: {
                      type: "string",
                      description:
                        "Event start date and time in YYYYMMDDTHHMMSS format",
                    },
                    end: {
                      type: "string",
                      description:
                        "Event end date and time in YYYYMMDDTHHMMSS format",
                    },
                    place: {
                      type: "string",
                      description:
                        "Location of the event. Name of the location and address.",
                    },
                    url: {
                      type: "string",
                      description: "URL of the event or the location.",
                    },
                    notes: {
                      type: "string",
                      description:
                        "Additional notes about the event or additional information and details. Additional URLs, contact information, etc.",
                    },
                  },
                  required: ["title", "start", "end"],
                },
              },
            },
            required: ["events"],
          },
        },
      ],
      function_call: { name: "extract_events_info" },
    };
    
    // Use the body with placeholders for cache key generation
    const cacheId = await getCacheKey(endpoint, body);
    const cachedData = getCachedResponse(cacheId);
    
    if (cachedData) {
      console.log("Using cached extract events response");
      const message = cachedData.choices[0].message;
      if (message.function_call && message.function_call.arguments) {
        const functionArgs = JSON.parse(message.function_call.arguments);
        return functionArgs.events;
      }
      return [];
    }

    console.log("Making fresh API call for event extraction");
    
    // Create a deep copy of the request body and replace placeholders
    const requestBody = JSON.parse(JSON.stringify(body));
    requestBody.messages[0].content = replacePlaceholders(requestBody.messages[0].content);
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setCachedResponse(cacheId, data);
    
    const message = data.choices[0].message;

    if (message.function_call && message.function_call.arguments) {
      const functionArgs = JSON.parse(message.function_call.arguments);
      return functionArgs.events;
    }

    return [];
  }

  groupEventsByStartEnd(eventsData) {
    const grouped = {};

    eventsData.forEach((event) => {
      const key = `${event.start}_${event.end}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    });

    return Object.values(grouped);
  }

  generateICSFile() {
    // Get the form element
    const form = this.shadowRoot.querySelector("#eventsDataForm");
    if (!form) return;

    // Create FormData object
    const formData = new FormData(form);

    // Build events array
    const events = [];

    this.previewData.forEach((group, groupIndex) => {
      const event = {};

      // Use global values if selected
      ["title", "place", "notes"].forEach((field) => {
        const globalValue = formData.get(`global_${field}`);
        event[field] = globalValue || "";
      });

      // Start and End times
      event["start"] = this.sanitizeDate(
        formData.get(`event_${groupIndex}_start`) || "",
      );
      event["end"] = this.sanitizeDate(
        formData.get(`event_${groupIndex}_end`) || "",
      );

      // Other fields specific to the event
      ["url"].forEach((field) => {
        event[field] = formData.get(`event_${groupIndex}_${field}`) || "";
      });

      events.push(event);
    });

    // Generate ICS content
    const icsContent = this.generateICS(events);

    // Create a Blob and URL for the ICS file
    this.icsBlob = new Blob([icsContent], { type: "text/calendar" });

    // Revoke previous URL if exists
    if (this.icsUrl) {
      URL.revokeObjectURL(this.icsUrl);
    }

    this.icsUrl = URL.createObjectURL(this.icsBlob);
    this.requestUpdate();
  }

  sanitizeDate(dateStr) {
    // Remove any non-digit characters except 'T'
    let sanitized = dateStr.replace(/[^\dT]/g, "");

    // Ensure 'T' is present between date and time
    if (!sanitized.includes("T")) {
      // Insert 'T' at the correct position
      sanitized = sanitized.substring(0, 8) + "T" + sanitized.substring(8);
    }

    // Ensure the string is in 'YYYYMMDDTHHMMSS' format
    const dateTimeRegex = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;
    const match = sanitized.match(dateTimeRegex);

    if (match) {
      // Valid format
      return sanitized;
    } else {
      // Attempt to fix common issues
      const digitsOnly = sanitized.replace(/T/g, "");
      if (digitsOnly.length >= 14) {
        sanitized =
          digitsOnly.substring(0, 8) + "T" + digitsOnly.substring(8, 14);
      } else {
        sanitized = digitsOnly.padEnd(14, "0");
        sanitized =
          sanitized.substring(0, 8) + "T" + sanitized.substring(8, 14);
      }
      return sanitized;
    }
  }

  generateICS(events) {
    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");

    // Include timezone information
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    lines.push("PRODID:-//Your Organization//Event to ICS Converter//EN");

    events.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + this.generateUID());
      lines.push("DTSTAMP:" + this.formatDateTime(new Date()));

      if (event.start) {
        lines.push("DTSTART;TZID=" + tzid + ":" + event.start);
      }
      if (event.end) {
        lines.push("DTEND;TZID=" + tzid + ":" + event.end);
      }
      if (event.title) {
        lines.push("SUMMARY:" + this.escapeICSText(event.title));
      }
      if (event.place) {
        lines.push("LOCATION:" + this.escapeICSText(event.place));
      }
      if (event.url) {
        lines.push("URL:" + this.escapeICSText(event.url));
      }
      if (event.notes) {
        lines.push("DESCRIPTION:" + this.escapeICSText(event.notes));
      }
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  generateUID() {
    return (
      "uid" +
      Date.now() +
      Math.random().toString(36).substring(2, 9) +
      "@example.com"
    );
  }

  formatDateTime(date) {
    // Returns date in YYYYMMDDTHHMMSS format
    const pad = (n) => (n < 10 ? "0" + n : n);
    return (
      date.getFullYear().toString() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  escapeICSText(text) {
    // Escape special characters for ICS format
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }
}

customElements.define("event-converter", EventConverter);
