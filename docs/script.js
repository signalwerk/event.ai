import {
  LitElement,
  html,
  css,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

// Define a default model and provider
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_MODEL = "google/gemini-2.5-pro-exp-03-25";
const MAX_TOKENS = 4096;

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

// Connection options for the dropdown
const CONNECTION_OPTIONS = [
  {
    provider: "openai",
    model: "gpt-3.5-turbo",
    label: "OpenAI - GPT-3.5 Turbo",
    endpoint: ENDPOINTS.openai,
  },
  {
    provider: "openai",
    model: "gpt-4",
    label: "OpenAI - GPT-4",
    endpoint: ENDPOINTS.openai,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "OpenAI - GPT-4o Mini",
    endpoint: ENDPOINTS.openai,
  },
  {
    provider: "openai",
    model: "gpt-4o",
    label: "OpenAI - GPT-4o",
    endpoint: ENDPOINTS.openai,
  },
  {
    provider: "openrouter",
    model: "google/gemini-2.5-pro-exp-03-25",
    label: "OpenRouter - Gemini 2.5 Pro Experimental (1 request per min)",
    endpoint: ENDPOINTS.openrouter,
  },
  {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-exp:free",
    label: "OpenRouter - Gemini 2.0 Flash Experimental (free)",
    endpoint: ENDPOINTS.openrouter,
  },
  {
    provider: "openrouter",
    model: "mistralai/mistral-small-3.1-24b-instruct:free",
    label: "OpenRouter - Mistral Small 3.1 24B Instruct (free)",
    endpoint: ENDPOINTS.openrouter,
  },
  {
    provider: "openrouter",
    model: "mistralai/mistral-7b-instruct:free",
    label: "OpenRouter - Mistral 7B Instruct (free)",
    endpoint: ENDPOINTS.openrouter,
  },
  {
    provider: "custom",
    model: "",
    label: "Custom API",
    endpoint: "", // This will be set by the user
  },
];

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

    * {
      margin: 0;
      padding: 0;
      font: inherit; /* Get rid of all font sizes and heights */
    }

    h1,
    h2 {
      font-weight: 700;
      margin-top: 1rem;
      margin-bottom: 0.2rem;
    }

    h1 {
      font-size: 1.2rem;
    }

    h2 {
      font-size: 1rem;
    }

    h3 {
      margin-top: 0;
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
    input[type="datetime-local"],
    input[type="date"],
    textarea,
    select {
      width: 100%;
      margin: 0.7rem 0;
      padding: 0.5rem;
      display: block;
      accent-color: var(--color-primary);
    }

    input[type="checkbox"] {
      accent-color: var(--color-primary);
    }

    button {
      box-shadow: none;
      background: transparent;
      text-shadow: none;
      cursor: pointer;
      line-height: inherit;
      border: 0.15em solid var(--color-black);
      border-radius: 0;
      color: inherit;
      padding: 0.5em 1em;
      margin: 0.7rem 0;
    }

    button:hover:not(:disabled) {
      color: var(--color-white);
      background-color: var(--color-primary);
      border-color: var(--color-primary);
    }
    a {
      text-decoration: none;
      color: var(--link-color);
      text-underline-offset: 0.3em;
      text-decoration: underline currentColor;
      text-decoration-thickness: 0.15em;
    }

    a:hover {
      color: inherit;
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
      border: var(--color-gray) 1px solid;
    }

    @media (min-width: 768px) {
      .table-container {
        flex-direction: row;
      }
      .column {
        width: calc(50% - 0.5rem);
      }
    }

    .error-message {
      color: #e53935;
      background-color: #ffebee;
      border: 1px solid #ffcdd2;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.7rem;
    }
  `;

  static properties = {
    apiKey: { type: String },
    eventText: { type: String },
    selectedConnection: { type: String },
    customApiUrl: { type: String },
    customModel: { type: String },
    processing: { type: Boolean },
    previewData: { type: Object },
    icsBlob: { type: Object },
    icsUrl: { type: String },
    errorMessage: { type: String },
    timeZone: { type: String },
  };

  constructor() {
    super();
    this.apiKey = localStorage.getItem("openai_api_key") ?? "";
    this.eventText = localStorage.getItem("event_text") ?? "";
    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const defaultOption =
      CONNECTION_OPTIONS.find(
        (option) =>
          option.provider === DEFAULT_PROVIDER &&
          option.model === DEFAULT_MODEL,
      ) || CONNECTION_OPTIONS[0];

    // Create the connection string in a consistent way
    const defaultConnection = `${defaultOption.provider}-${defaultOption.model}`;

    // Get connection from localStorage or use default
    const storedConnection = localStorage.getItem("selected_connection");
    this.selectedConnection = storedConnection ?? defaultConnection;

    // If it's first startup, save this selection to localStorage
    if (!storedConnection) {
      localStorage.setItem("selected_connection", this.selectedConnection);
    }

    console.log("Default provider:", DEFAULT_PROVIDER);
    console.log("Default model:", DEFAULT_MODEL);
    console.log("Default option:", defaultOption);
    console.log("Selected connection:", this.selectedConnection);

    this.customApiUrl =
      localStorage.getItem("custom_api_url") ?? defaultOption.endpoint;
    this.customModel =
      localStorage.getItem("custom_model") ?? defaultOption.model;
    this.processing = false;
    this.previewData = null;
    this.icsBlob = null;
    this.icsUrl = "";
    this.errorMessage = "";
  }

  render() {
    // Debug available options
    console.log(
      "Available options:",
      CONNECTION_OPTIONS.map((option) => ({
        label: option.label,
        value: option.provider + "-" + option.model,
      })),
    );
    console.log("Currently selected:", this.selectedConnection);

    // Check if the selectedConnection value exists in the options
    const optionValues = CONNECTION_OPTIONS.map(
      (option) => option.provider + "-" + option.model,
    );
    const isValidSelection = optionValues.includes(this.selectedConnection);
    console.log("Is valid selection:", isValidSelection);
    console.log("All option values:", optionValues);

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
        placeholder="Enter your API Key"
      />

      <!-- Connection Selection Dropdown -->
      <label for="connectionSelect">Select Connection</label>
      <select
        id="connectionSelect"
        @change=${this.handleConnectionChange}
        .value=${this.selectedConnection}
      >
        ${CONNECTION_OPTIONS.map((option) => {
          const value = option.provider + "-" + option.model;
          return html`
            <option
              value=${value}
              ?selected=${this.selectedConnection === value}
            >
              ${option.label}
            </option>
          `;
        })}
      </select>

      <!-- Custom API Options (conditionally displayed) -->
      ${this.selectedConnection === "custom-"
        ? html`
            <label for="customApiUrl">Custom API URL</label>
            <input
              type="text"
              id="customApiUrl"
              .value=${this.customApiUrl}
              @input=${(e) => {
                this.customApiUrl = e.target.value;
                localStorage.setItem("custom_api_url", this.customApiUrl);
              }}
              placeholder="Enter API URL (e.g., https://api.openai.com/v1/chat/completions)"
            />
            <label for="customModel">Model Name</label>
            <input
              type="text"
              id="customModel"
              .value=${this.customModel}
              @input=${(e) => {
                this.customModel = e.target.value;
                localStorage.setItem("custom_model", this.customModel);
              }}
              placeholder="Enter model name (e.g., gpt-4)"
            />
          `
        : ""}

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

      <!-- Error Message Display -->
      ${this.errorMessage
        ? html`<div class="error-message">${this.errorMessage}</div>`
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

  handleConnectionChange(e) {
    const previousConnection = this.selectedConnection;
    this.selectedConnection = e.target.value;

    // Reset error message when connection changes
    this.errorMessage = "";

    // If switching to custom, save the previous connection's endpoint and model
    if (
      this.selectedConnection === "custom-" &&
      previousConnection !== "custom-"
    ) {
      // Split previous connection into provider and model
      const [provider, ...modelParts] = previousConnection.split("-");
      // Decode the encoded model name
      const encodedModel = modelParts.join("-"); // Rejoin in case model has dashes
      const model = decodeURIComponent(encodedModel);

      // Find the matching provider in CONNECTION_OPTIONS to get the endpoint
      const matchingOption = CONNECTION_OPTIONS.find(
        (option) => option.provider === provider,
      );
      const endpoint = matchingOption
        ? matchingOption.endpoint
        : ENDPOINTS.openai;

      this.customApiUrl = endpoint;
      this.customModel = model;
      localStorage.setItem("custom_api_url", endpoint);
      localStorage.setItem("custom_model", model);
    }

    localStorage.setItem("selected_connection", this.selectedConnection);
    this.requestUpdate();
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
    // Convert the YYYYMMDDTHHMMSS format to YYYY-MM-DDTHH:MM format for datetime-local input
    const startDatetime = event.startDate
      ? this.formatForDatetimeLocal(event.startDate)
      : this.formatForDatetimeLocal(event.start);
    const endDatetime = event.endDate
      ? this.formatForDatetimeLocal(event.endDate)
      : this.formatForDatetimeLocal(event.end);

    // Get just the date part for full-day events
    const startDate = startDatetime ? startDatetime.split("T")[0] : "";
    const endDate = endDatetime ? endDatetime.split("T")[0] : "";

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
          <label for="event_${eventIndex}_fullday">Full-day Event</label>
          <input
            type="checkbox"
            id="event_${eventIndex}_fullday"
            name="event_${eventIndex}_fullday"
            ?checked=${event.isFullDay}
            @change=${(e) => this.toggleFullDayEvent(e, eventIndex)}
          />
        </div>

        <div
          class="row event-${eventIndex}-datetime"
          style=${event.isFullDay ? "display: none;" : ""}
        >
          <label>Start</label>
          <input
            type="datetime-local"
            name="event_${eventIndex}_start_datetime"
            id="event_${eventIndex}_start_datetime"
            .value=${startDatetime}
          />
        </div>

        <div
          class="row event-${eventIndex}-datetime"
          style=${event.isFullDay ? "display: none;" : ""}
        >
          <label>End</label>
          <input
            type="datetime-local"
            name="event_${eventIndex}_end_datetime"
            id="event_${eventIndex}_end_datetime"
            .value=${endDatetime}
          />
        </div>

        <div
          class="row event-${eventIndex}-fullday"
          style=${event.isFullDay ? "" : "display: none;"}
        >
          <label>Start Date</label>
          <input
            type="date"
            name="event_${eventIndex}_start_date"
            id="event_${eventIndex}_start_date"
            .value=${startDate}
          />
        </div>

        <div
          class="row event-${eventIndex}-fullday"
          style=${event.isFullDay ? "" : "display: none;"}
        >
          <label>End Date</label>
          <input
            type="date"
            name="event_${eventIndex}_end_date"
            id="event_${eventIndex}_end_date"
            .value=${endDate}
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
          <textarea
            name="event_${eventIndex}_place"
            rows="4"
            .value=${event.place || ""}
          ></textarea>
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
          <textarea name="event_${eventIndex}_notes" rows="4">
${event.notes || ""}</textarea
          >
        </div>
      </div>
    `;
  }

  toggleFullDayEvent(e, eventIndex) {
    const isFullDay = e.target.checked;
    const datetimeFields = this.shadowRoot.querySelectorAll(
      `.event-${eventIndex}-datetime`,
    );
    const fulldayFields = this.shadowRoot.querySelectorAll(
      `.event-${eventIndex}-fullday`,
    );

    datetimeFields.forEach((field) => {
      field.style.display = isFullDay ? "none" : "block";
    });

    fulldayFields.forEach((field) => {
      field.style.display = isFullDay ? "block" : "none";
    });
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

  formatForDatetimeLocal(datetimeInput) {
    // If it's already a Date object, format it directly
    if (datetimeInput instanceof Date) {
      if (isNaN(datetimeInput.getTime())) return "";

      const pad = (n) => (n < 10 ? "0" + n : n);
      return `${datetimeInput.getFullYear()}-${pad(
        datetimeInput.getMonth() + 1,
      )}-${pad(datetimeInput.getDate())}T${pad(datetimeInput.getHours())}:${pad(
        datetimeInput.getMinutes(),
      )}`;
    }

    // Otherwise, handle it as a string
    if (!datetimeInput || typeof datetimeInput !== "string") return "";

    // Parse YYYYMMDDTHHMMSS format to YYYY-MM-DDTHH:MM
    const match = datetimeInput.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
    );
    if (match) {
      const [_, year, month, day, hours, minutes] = match;
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } else {
      console.error(
        `Error parsing date ${datetimeInput} is not in the expected format (YYYYMMDDTHHMMSS)`,
      );
    }

    return "";
  }

  async extractEventsFromText() {
    const apiKey = this.apiKey.trim();
    const eventText = this.eventText.trim();

    if (!apiKey || !eventText) {
      this.errorMessage = "Please enter both API Key and Event Text.";
      return;
    }

    // Reset previous error
    this.errorMessage = "";

    // Start processing
    this.processing = true;
    this.previewData = null;
    this.icsUrl = "";
    this.requestUpdate();

    try {
      // Extract events
      const eventsData = await this.extractEvents(apiKey, eventText);
      console.log("Extracted events data:", eventsData);

      if (eventsData.length > 0) {
        // Use events data directly without grouping
        this.previewData = eventsData;
      } else {
        this.errorMessage =
          "Failed to extract event information. No events were found.";
      }
    } catch (error) {
      console.error("Error:", error);
      this.errorMessage = `API Error: ${error.message}`;

      // Add more detailed error information if available
      if (error.details) {
        this.errorMessage += `\n\nDetails: ${JSON.stringify(
          error.details,
          null,
          2,
        )}`;
      }
    } finally {
      this.processing = false;
      this.requestUpdate();
    }
  }

  async extractEvents(apiKey, eventText) {
    // Get API endpoint and model based on selected connection
    let endpoint, model;

    // Get provider and model from selected connection
    const [provider, ...modelParts] = this.selectedConnection.split("-");
    const encodedModel = modelParts.join("-"); // Rejoin in case model has dashes
    const modelName = decodeURIComponent(encodedModel); // Decode the model name

    if (provider === "custom") {
      endpoint = this.customApiUrl;
      model = this.customModel;
    } else {
      const selectedOption = CONNECTION_OPTIONS.find(
        (option) => option.provider === provider && option.model === modelName,
      );

      if (!selectedOption) {
        throw new Error(
          `Invalid connection selected: ${this.selectedConnection}`,
        );
      }

      endpoint = selectedOption.endpoint;
      model = modelName;
    }

    const body = {
      model: model,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        { role: "user", content: eventText },
      ],
      tools: [
        {
          type: "function",
          function: {
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
                          "Location of the event. Name of the location and address. Newline separated.",
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
        },
      ],
      tool_choice: "required",
    };

    // For OpenRouter, add HTTP_REFERER header requirement
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    };

    if (provider === "openrouter") {
      headers["HTTP-Referer"] = window.location.href;
      headers["X-Title"] = "Events labeling tool";
    }

    // Use the body with placeholders for cache key generation
    const cacheId = await getCacheKey(endpoint, body);
    // Add a console log to better understand caching behavior
    console.log(
      "Using connection:",
      this.selectedConnection,
      "Text size:",
      eventText.length,
    );

    const cachedData = getCachedResponse(cacheId);

    if (cachedData) {
      console.log("Using cached extract events response");
      if (cachedData.error) {
        // If we stored an error response in the cache
        throw new Error(cachedData.error.message || "Unknown error");
      }

      const message = cachedData.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        const functionArgs = JSON.parse(
          message.tool_calls[0].function.arguments,
        );
        return this.normalizeEvents(functionArgs.events);
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
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      // Store the error in the cache so we don't retry failing requests
      setCachedResponse(cacheId, data);

      // Throw a detailed error with the response data
      const error = new Error(
        data.error?.message || `HTTP error! status: ${response.status}`,
      );
      error.details = data.error;
      throw error;
    }

    setCachedResponse(cacheId, data);

    const message = data.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const functionArgs = JSON.parse(message.tool_calls[0].function.arguments);
      return this.normalizeEvents(functionArgs.events);
    }
    return [];
  }

  normalizeEvents(events) {
    return events.map((event) => {
      const normalizedEvent = { ...event };

      // Convert date strings to Date objects
      if (event.start) {
        // First sanitize the string format
        const startStr = this.sanitizeDate(event.start);
        // Parse YYYYMMDDTHHMMSS to Date object
        const match = startStr.match(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
        );
        if (match) {
          const [_, year, month, day, hours, minutes, seconds] = match;
          normalizedEvent.startDate = new Date(
            parseInt(year),
            parseInt(month) - 1, // month is 0-indexed in JS Date
            parseInt(day),
            parseInt(hours),
            parseInt(minutes),
            parseInt(seconds),
          );
          // Keep the original string format for compatibility
          normalizedEvent.start = startStr;
        }
      }

      if (event.end) {
        // First sanitize the string format
        const endStr = this.sanitizeDate(event.end);
        // Parse YYYYMMDDTHHMMSS to Date object
        const match = endStr.match(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
        );
        if (match) {
          const [_, year, month, day, hours, minutes, seconds] = match;
          normalizedEvent.endDate = new Date(
            parseInt(year),
            parseInt(month) - 1, // month is 0-indexed in JS Date
            parseInt(day),
            parseInt(hours),
            parseInt(minutes),
            parseInt(seconds),
          );
          // Keep the original string format for compatibility
          normalizedEvent.end = endStr;
        }
      }

      // Detect full-day events (starts at 00:00 and ends at 23:59 on the same or different day)
      if (normalizedEvent.startDate && normalizedEvent.endDate) {
        const startHours = normalizedEvent.startDate.getHours();
        const startMinutes = normalizedEvent.startDate.getMinutes();
        const startSeconds = normalizedEvent.startDate.getSeconds();

        const endHours = normalizedEvent.endDate.getHours();
        const endMinutes = normalizedEvent.endDate.getMinutes();
        const endSeconds = normalizedEvent.endDate.getSeconds();

        // If event starts at 00:00:00 and ends at 23:59:00 or 23:59:59, mark it as full day
        if (
          startHours === 0 &&
          startMinutes === 0 &&
          startSeconds === 0 &&
          endHours === 23 &&
          endMinutes === 59 &&
          (endSeconds === 0 || endSeconds === 59)
        ) {
          normalizedEvent.isFullDay = true;
        }
      }

      return normalizedEvent;
    });
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

      // Check if it's a full-day event
      const isFullDay = formData.get(`event_${eventIndex}_fullday`) === "on";
      eventData["isFullDay"] = isFullDay;

      if (isFullDay) {
        // Get date values for full-day events
        const startDateStr =
          formData.get(`event_${eventIndex}_start_date`) || "";
        const endDateStr = formData.get(`event_${eventIndex}_end_date`) || "";

        if (startDateStr) {
          const [year, month, day] = startDateStr.split("-").map(Number);
          eventData.startDate = new Date(year, month - 1, day, 0, 0, 0);
          // Also keep string format for backward compatibility
          eventData.start = this.formatFullDayDate(startDateStr);
        }

        if (endDateStr) {
          const [year, month, day] = endDateStr.split("-").map(Number);
          // For end dates in all-day events, we set to end of day (23:59:59)
          // but when generating ICS we'll add 1 day per iCalendar spec
          eventData.endDate = new Date(year, month - 1, day, 23, 59, 59);
          // Also keep string format for backward compatibility
          eventData.end = this.formatFullDayDate(endDateStr, true);
        }
      } else {
        // Get datetime values for regular events
        const startDatetimeStr =
          formData.get(`event_${eventIndex}_start_datetime`) || "";
        const endDatetimeStr =
          formData.get(`event_${eventIndex}_end_datetime`) || "";

        if (startDatetimeStr) {
          const startDate = new Date(startDatetimeStr);
          eventData.startDate = startDate;
          // Also keep string format for backward compatibility
          eventData.start = this.formatDateTime(startDate);
        }

        if (endDatetimeStr) {
          const endDate = new Date(endDatetimeStr);
          eventData.endDate = endDate;
          // Also keep string format for backward compatibility
          eventData.end = this.formatDateTime(endDate);
        }
      }

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

  formatDatetimeToICS(input) {
    // If it's a Date object, format it directly
    if (input instanceof Date) {
      if (isNaN(input.getTime())) return "";
      return this.formatDateTime(input);
    }

    // Convert HTML datetime-local format (YYYY-MM-DDTHH:MM) to YYYYMMDDTHHMMSS
    if (!input || typeof input !== "string") return "";

    const date = new Date(input);
    if (isNaN(date.getTime())) return "";

    return this.formatDateTime(date);
  }

  formatFullDayDate(dateInput, isEndDate = false) {
    // If it's a Date object, format it directly
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) return "";

      let date = new Date(dateInput);
      // For end dates in all-day events, add 1 day per iCalendar spec
      if (isEndDate) {
        date.setDate(date.getDate() + 1);
      }

      return (
        date.getFullYear().toString() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0")
      );
    }

    // Otherwise handle it as a string
    if (!dateInput || typeof dateInput !== "string") return "";

    // Parse the date string (YYYY-MM-DD)
    const [year, month, day] = dateInput.split("-").map(Number);

    // For end dates in all-day events, add 1 day per iCalendar spec
    if (isEndDate) {
      const endDate = new Date(year, month - 1, day);
      endDate.setDate(endDate.getDate() + 1);
      return (
        endDate.getFullYear().toString() +
        String(endDate.getMonth() + 1).padStart(2, "0") +
        String(endDate.getDate()).padStart(2, "0")
      );
    }

    // Format as YYYYMMDD for start date
    return (
      year.toString() +
      String(month).padStart(2, "0") +
      String(day).padStart(2, "0")
    );
  }

  generateICS(events) {
    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//Your Organization//Event to ICS Converter//EN");
    lines.push("CALSCALE:GREGORIAN");

    // Include timezone information
    const tzid = this.timeZone;

    events.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + this.generateUID());
      lines.push("DTSTAMP:" + this.formatDateTime(new Date()));

      if (event.startDate) {
        if (event.isFullDay) {
          // For full-day events, use VALUE=DATE format without time or timezone
          const dateStr =
            event.startDate.getFullYear().toString() +
            String(event.startDate.getMonth() + 1).padStart(2, "0") +
            String(event.startDate.getDate()).padStart(2, "0");
          lines.push("DTSTART;VALUE=DATE:" + dateStr);
        } else {
          lines.push(
            "DTSTART;TZID=" + tzid + ":" + this.formatDateTime(event.startDate),
          );
        }
      } else if (event.start) {
        // Fallback to string if Date object is not available
        if (event.isFullDay) {
          // For full-day events, use VALUE=DATE format without time or timezone
          lines.push("DTSTART;VALUE=DATE:" + event.start.substring(0, 8));
        } else {
          lines.push("DTSTART;TZID=" + tzid + ":" + event.start);
        }
      }

      if (event.endDate) {
        if (event.isFullDay) {
          // For full-day events, use VALUE=DATE format without time or timezone
          // For end dates, add 1 day per iCalendar spec
          const endDate = new Date(event.endDate);
          endDate.setDate(endDate.getDate() + 1);
          const dateStr =
            endDate.getFullYear().toString() +
            String(endDate.getMonth() + 1).padStart(2, "0") +
            String(endDate.getDate()).padStart(2, "0");
          lines.push("DTEND;VALUE=DATE:" + dateStr);
        } else {
          lines.push(
            "DTEND;TZID=" + tzid + ":" + this.formatDateTime(event.endDate),
          );
        }
      } else if (event.end) {
        // Fallback to string if Date object is not available
        if (event.isFullDay) {
          // For full-day events, use VALUE=DATE format without time or timezone
          lines.push("DTEND;VALUE=DATE:" + event.end.substring(0, 8));
        } else {
          lines.push("DTEND;TZID=" + tzid + ":" + event.end);
        }
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
