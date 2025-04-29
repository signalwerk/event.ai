import {
  LitElement,
  html,
  css,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

// Use a placeholder for the timestamp that will be replaced before making actual API calls
const SYSTEM_PROMPT = `You are an assistant that extracts event information from text. The text may contain information about multiple events. Return all the events found in the text. Don't change the language of the text. Today's date and time are {{$now}}.`;

// Check if the current hostname is localhost
const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Cache helper functions with SHA-256 hashing
async function sha256(source) {
  const sourceBytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
  const resultBytes = [...new Uint8Array(digest)];
  return resultBytes.map((x) => x.toString(16).padStart(2, "0")).join("");
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
  const sortedBody = JSON.stringify(body);
  console.log(endpoint + sortedBody);
  const hash = await sha256(endpoint + sortedBody);
  return `cache_${hash}`;
};

const getCachedResponse = (key) => {
  try {
    // Only use cache if running on localhost
    if (!isLocalhost) {
      console.log("Not using cache: not on localhost");
      return null;
    }

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
    // Only cache if running on localhost
    if (!isLocalhost) {
      console.log("Not caching: not on localhost");
      return;
    }

    sessionStorage.setItem(key, JSON.stringify(data));
    console.log(`Cache set for key: ${key}`);
  } catch (error) {
    console.error("Cache storage error:", error);
  }
};

class EventConverter extends LitElement {
  static styles = css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    h1,
    h2,
    h3 {
      font-weight: 700;
      margin-top: 1rem;
      margin-bottom: 0.2rem;
      text-wrap: balance;
    }

    h1 {
      font-size: 1.2rem;
    }

    h2 {
      font-size: 1rem;
    }

    h3 {
      font-size: 0.8rem;
    }

    label {
      margin-top: 1rem;
      margin-bottom: 0.4rem;
      font-weight: 700;
      display: block;
    }

    input[type="text"],
    input[type="password"],
    textarea,
    select {
      width: 100%;
      margin: 0.7rem 0;
      padding: 0.5rem;
      display: block;
    }

    button {
      padding: 0.7rem 2rem;
      margin: 0.7rem 0;
    }

    .processing-label {
      font-weight: bold;
    }

    .download-link {
      display: inline-block;
      margin-top: 0.7rem;
    }

    .preview {
      overflow-x: auto;
    }

    .table {
      display: table;
      border-collapse: collapse;
    }

    .table-container {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      flex-direction: column;
      gap: 1rem;
    }

    .column {
      position: relative;
      vertical-align: top;
      padding: 0.5rem;
      border: 1px solid #ccc;
    }

    @media (min-width: 768px) {
      .table-container {
        flex-direction: row;
      }
      .column {
        width: calc(50% - 0.5rem);
      }
    }
  `;

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
    this.selectedModel = localStorage.getItem("selected_model") ?? "gpt-4";
    this.processing = false;
    this.previewData = null;
    this.icsBlob = null;
    this.icsUrl = "";
  }

  render() {
    return html`
      <!-- API Key Input -->
      <h1>Event to ICS Converter</h1>

      <label for="apiKey">API Key</label>
      <input
        type="password"
        id="apiKey"
        .value=${this.apiKey}
        @input=${(e) => {
          this.apiKey = e.target.value;
          localStorage.setItem("openai_api_key", this.apiKey);
        }}
        placeholder="Enter your OpenAI API Key"
      />

      <!-- Model Selection Dropdown -->
      <label for="modelSelect">Select Model</label>
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

      <!-- Event Text Input -->
      <label for="eventText">Event Text</label>
      <textarea
        id="eventText"
        rows="10"
        .value=${this.eventText}
        @input=${(e) => {
          this.eventText = e.target.value;
          localStorage.setItem("event_text", this.eventText);
        }}
        placeholder="Enter event details here..."
      ></textarea>

      <!-- Extract Events Button -->
      <button @click=${this.extractEventsFromText}>Extract Events</button>

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
          ${this.previewData.map((event, eventIndex) =>
            this.renderEventGroup(event, eventIndex),
          )}
        </div>

        <button type="button" @click=${this.generateICSFile}>
          Generate ICS File
        </button>
      </form>
    `;
  }

  renderEventGroup(event, eventIndex) {
    return html`
      <div class="column">
        <h3>Event ${eventIndex + 1}</h3>

        <div class="row">
          <label for="event_${eventIndex}_include">Include in ICS</label>
          <input
            type="checkbox"
            id="event_${eventIndex}_include"
            name="event_${eventIndex}_include"
            checked
          />
        </div>

        <div class="row">
          <label>Start</label>
          <input
            type="text"
            name="event_${eventIndex}_start"
            .value=${event.start}
          />
        </div>

        <div class="row">
          <label>End</label>
          <input
            type="text"
            name="event_${eventIndex}_end"
            .value=${event.end}
          />
        </div>

        <div class="row">
          <label>Title</label>
          <input
            type="text"
            name="event_${eventIndex}_title"
            .value=${event.title || ""}
          />
        </div>

        <div class="row">
          <label>Place</label>
          <input
            type="text"
            name="event_${eventIndex}_place"
            .value=${event.place || ""}
          />
        </div>

        <div class="row">
          <label>URL</label>
          <input
            type="text"
            name="event_${eventIndex}_url"
            .value=${event.url || ""}
          />
        </div>

        <div class="row">
          <label>Notes</label>
          <textarea name="event_${eventIndex}_notes" rows="3" cols="40">
${event.notes || ""}</textarea
          >
        </div>
      </div>
    `;
  }

  async extractEventsFromText() {
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
        // Use events data directly without grouping
        this.previewData = eventsData;
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
    // Add a console log to better understand caching behavior
    console.log(
      "Using model:",
      this.selectedModel,
      "Text size:",
      eventText.length,
    );

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
    requestBody.messages[0].content = replacePlaceholders(
      requestBody.messages[0].content,
    );

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

  generateICSFile() {
    // Get the form element
    const form = this.shadowRoot.querySelector("#eventsDataForm");
    if (!form) return;

    // Create FormData object
    const formData = new FormData(form);

    // Build events array
    const events = [];

    this.previewData.forEach((event, eventIndex) => {
      // Check if this event should be included
      if (!formData.get(`event_${eventIndex}_include`)) {
        return; // Skip this event
      }

      const eventData = {};

      // Add fields from the form
      ["title", "place", "notes", "url"].forEach((field) => {
        eventData[field] = formData.get(`event_${eventIndex}_${field}`) || "";
      });

      // Start and End times
      eventData["start"] = this.sanitizeDate(
        formData.get(`event_${eventIndex}_start`) || "",
      );
      eventData["end"] = this.sanitizeDate(
        formData.get(`event_${eventIndex}_end`) || "",
      );

      events.push(eventData);
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
