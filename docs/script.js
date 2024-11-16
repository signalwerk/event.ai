const SYSTEM_PROMPT_TIME_CONTEXT = `Today's date and time are ${new Date().toISOString()}.`;

document.addEventListener("DOMContentLoaded", function () {
  const apiKeyInput = document.getElementById("apiKey");
  const eventTextInput = document.getElementById("eventText");
  const convertButton = document.getElementById("convertButton");
  const previewDiv = document.getElementById("preview");
  const downloadLink = document.getElementById("downloadLink");
  const modelSelect = document.getElementById("modelSelect");
  const preprocessCheckbox = document.getElementById("preprocessCheckbox");
  const processingLabel = document.getElementById("processingLabel");

  // Load API key and model selection from localStorage
  if (localStorage.getItem("openai_api_key")) {
    apiKeyInput.value = localStorage.getItem("openai_api_key");
  }
  if (localStorage.getItem("selected_model")) {
    modelSelect.value = localStorage.getItem("selected_model");
  }
  if (localStorage.getItem("preprocess_enabled") === "true") {
    preprocessCheckbox.checked = true;
  }

  convertButton.addEventListener("click", async function () {
    const apiKey = apiKeyInput.value.trim();
    let eventText = eventTextInput.value.trim();
    const selectedModel = modelSelect.value;
    const preprocessEnabled = preprocessCheckbox.checked;

    if (!apiKey || !eventText) {
      alert("Please enter both API Key and Event Text.");
      return;
    }

    // Store API key and model selection in localStorage
    localStorage.setItem("openai_api_key", apiKey);
    localStorage.setItem("selected_model", selectedModel);
    localStorage.setItem("preprocess_enabled", preprocessEnabled);

    // Show processing label
    processingLabel.style.display = "block";
    previewDiv.innerHTML = "";
    downloadLink.style.display = "none";

    // Pre-processing Step
    if (preprocessEnabled) {
      try {
        const preprocessResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + apiKey,
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: [
                {
                  role: "system",
                  content: `You are an assistant that extracts important information from text about events, and removes any clutter or irrelevant details that might come from copy-paste artifacts. ${SYSTEM_PROMPT_TIME_CONTEXT}`,
                },
                { role: "user", content: eventText },
              ],
            }),
          },
        );

        if (!preprocessResponse.ok) {
          throw new Error(`HTTP error! status: ${preprocessResponse.status}`);
        }

        const preprocessData = await preprocessResponse.json();
        const preprocessMessage =
          preprocessData.choices[0].message.content.trim();

        // Use the cleaned text for the next step
        eventText = preprocessMessage;
      } catch (error) {
        console.error("Pre-processing Error:", error);
        alert("An error occurred during pre-processing.");
        processingLabel.style.display = "none";
        return;
      }
    }

    // Call OpenAI API to extract events
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              {
                role: "system",
                content: `You are an assistant that extracts event information from text. The text may contain information about multiple events. Return all the events found in the text. ${SYSTEM_PROMPT_TIME_CONTEXT}`,
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
                              "Title of the event. Never include 'event' in the title. It is redundant. Also, the title should be short and descriptive. No need to include the date or time or location in the title.",
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
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const message = data.choices[0].message;
      let eventsData = [];

      if (message.function_call && message.function_call.arguments) {
        const functionArgs = JSON.parse(message.function_call.arguments);
        eventsData = functionArgs.events;
      } else {
        console.error("Assistant message:", message);
      }

      // Hide processing label
      processingLabel.style.display = "none";

      if (eventsData.length > 0) {
        // Create options for each event
        createColumnsLayout(eventsData);
      } else {
        alert("Failed to extract event information.");
        return;
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred while extracting events.");
      processingLabel.style.display = "none";
      return;
    }
  });

  function createColumnsLayout(eventsData) {
    previewDiv.innerHTML = "<h2>Select Event Data</h2>";

    const form = document.createElement("form");
    form.id = "eventsDataForm";

    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";

    // Global Options Column
    const globalColumn = document.createElement("div");
    globalColumn.className = "column";
    globalColumn.style.minWidth = "200px";

    const globalHeader = document.createElement("h3");
    globalHeader.textContent = "Global Options";
    globalColumn.appendChild(globalHeader);

    const globalFields = ["title", "place", "notes"];

    globalFields.forEach((field) => {
      const fieldDiv = document.createElement("div");
      fieldDiv.className = "grouped-options";

      const label = document.createElement("label");
      label.textContent = `Select ${field} for all events:`;
      fieldDiv.appendChild(label);

      const valuesSet = new Set();

      eventsData.forEach((event) => {
        if (event[field]) {
          valuesSet.add(event[field]);
        }
      });

      const values = Array.from(valuesSet);

      values.forEach((value, index) => {
        const optionDiv = document.createElement("div");

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `global_${field}`;
        radio.value = value;
        if (index === 0) {
          radio.checked = true;
        }

        const radioLabel = document.createElement("label");
        radioLabel.textContent = value;

        optionDiv.appendChild(radio);
        optionDiv.appendChild(radioLabel);
        fieldDiv.appendChild(optionDiv);
      });

      globalColumn.appendChild(fieldDiv);
    });

    tableContainer.appendChild(globalColumn);

    // Event Columns
    const eventsByStartEnd = groupEventsByStartEnd(eventsData);

    eventsByStartEnd.forEach((group, groupIndex) => {
      const eventColumn = document.createElement("div");
      eventColumn.className = "column";

      const eventHeader = document.createElement("h3");
      eventHeader.textContent = `Event Group ${groupIndex + 1}`;
      eventColumn.appendChild(eventHeader);

      // Start and End times are same for this group
      const startFieldDiv = document.createElement("div");
      startFieldDiv.style.marginBottom = "10px";
      const startLabel = document.createElement("label");
      startLabel.textContent = "Start:";
      startFieldDiv.appendChild(startLabel);
      const startInput = document.createElement("input");
      startInput.type = "text";
      startInput.name = `event_${groupIndex}_start`;
      startInput.value = group[0].start;
      startFieldDiv.appendChild(startInput);
      eventColumn.appendChild(startFieldDiv);

      const endFieldDiv = document.createElement("div");
      endFieldDiv.style.marginBottom = "10px";
      const endLabel = document.createElement("label");
      endLabel.textContent = "End:";
      endFieldDiv.appendChild(endLabel);
      const endInput = document.createElement("input");
      endInput.type = "text";
      endInput.name = `event_${groupIndex}_end`;
      endInput.value = group[0].end;
      endFieldDiv.appendChild(endInput);
      eventColumn.appendChild(endFieldDiv);

      // For fields like title, place, notes, allow selection among responses
      ["title", "place", "url", "notes"].forEach((field) => {
        const fieldDiv = document.createElement("div");
        fieldDiv.className = "grouped-options";

        const label = document.createElement("label");
        label.textContent = `Select ${field}:`;
        fieldDiv.appendChild(label);

        const valuesSet = new Set();

        group.forEach((event) => {
          if (event[field]) {
            valuesSet.add(event[field]);
          }
        });

        const values = Array.from(valuesSet);

        values.forEach((value, index) => {
          const optionDiv = document.createElement("div");

          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = `event_${groupIndex}_${field}`;
          radio.value = value;
          if (index === 0) {
            radio.checked = true;
          }

          const radioLabel = document.createElement("label");
          radioLabel.textContent = value;

          optionDiv.appendChild(radio);
          optionDiv.appendChild(radioLabel);
          fieldDiv.appendChild(optionDiv);
        });

        eventColumn.appendChild(fieldDiv);
      });

      tableContainer.appendChild(eventColumn);
    });

    form.appendChild(tableContainer);

    // Generate ICS Button
    const generateButton = document.createElement("button");
    generateButton.type = "button";
    generateButton.textContent = "Generate ICS File";
    generateButton.addEventListener("click", function () {
      const formData = new FormData(form);

      const events = [];

      eventsByStartEnd.forEach((group, groupIndex) => {
        const event = {};

        // Use global values if selected
        ["title", "place", "notes"].forEach((field) => {
          const globalValue = formData.get(`global_${field}`);
          event[field] = globalValue || "";
        });

        // Start and End times
        event["start"] = sanitizeDate(
          formData.get(`event_${groupIndex}_start`) || "",
        );
        event["end"] = sanitizeDate(
          formData.get(`event_${groupIndex}_end`) || "",
        );

        // Other fields specific to the event
        ["url"].forEach((field) => {
          event[field] = formData.get(`event_${groupIndex}_${field}`) || "";
        });

        events.push(event);
      });

      // Generate ICS file with selected data
      const icsContent = generateICS(events);

      // Create a Blob and URL for the ICS file
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);

      // Set up the download link
      downloadLink.href = url;
      downloadLink.style.display = "inline";
    });

    form.appendChild(generateButton);
    previewDiv.appendChild(form);
  }

  function groupEventsByStartEnd(eventsData) {
    const groups = [];
    const grouped = {};

    eventsData.forEach((event) => {
      const key = `${event.start}_${event.end}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    });

    for (let key in grouped) {
      groups.push(grouped[key]);
    }

    return groups;
  }

  function sanitizeDate(dateStr) {
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

  function generateICS(events) {
    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");

    // Include timezone information
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    lines.push("PRODID:-//Your Organization//Event to ICS Converter//EN");

    events.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + generateUID());
      lines.push("DTSTAMP:" + formatDateTime(new Date()));

      if (event.start) {
        lines.push("DTSTART;TZID=" + tzid + ":" + event.start);
      }
      if (event.end) {
        lines.push("DTEND;TZID=" + tzid + ":" + event.end);
      }
      if (event.title) {
        lines.push("SUMMARY:" + escapeICSText(event.title));
      }
      if (event.place) {
        lines.push("LOCATION:" + escapeICSText(event.place));
      }
      if (event.url) {
        lines.push("URL:" + escapeICSText(event.url));
      }
      if (event.notes) {
        lines.push("DESCRIPTION:" + escapeICSText(event.notes));
      }
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function generateUID() {
    return (
      "uid" +
      Date.now() +
      Math.random().toString(36).substr(2, 9) +
      "@example.com"
    );
  }

  function formatDateTime(date) {
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

  function escapeICSText(text) {
    // Escape special characters for ICS format
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }
});
