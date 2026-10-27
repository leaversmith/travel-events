let travelData = null;
let mapDocument = null;
let activeTraveller = "all";

const mapObject =
    document.getElementById(
        "travel-map-object"
    );

const detailsTarget =
    document.getElementById(
        "place-details"
    );

const historyTarget =
    document.getElementById(
        "event-history"
    );

const historySummary =
    document.getElementById(
        "history-summary"
    );

const statsTarget =
    document.getElementById(
        "travel-stats"
    );

const loadError =
    document.getElementById(
        "load-error"
    );


async function loadTravelData() {
    const yaml = await import(
        "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm"
    );

    const response = await fetch(
        "travel-events.yaml"
    );

    if (!response.ok) {
        throw new Error(
            `Could not load travel-events.yaml (${response.status})`
        );
    }

    const source =
        yaml.load(
            await response.text(),
            {
                schema:
                    yaml.JSON_SCHEMA
            }
        );

    travelData =
        normaliseTravelData(
            source
        );
}


function normaliseTravelData(
    source
) {
    if (
        !source ||
        typeof source !==
            "object"
    ) {
        throw new Error(
            "Travel file is empty or invalid."
        );
    }

    const travellers =
        normaliseTravellers(
            source.travellers
        );

    const groups =
        normaliseGroups(
            source.groups ?? {},
            travellers
        );

    const {
        places,
        placeAliases
    } =
        normalisePlaces(
            source.places ?? {}
        );

    const usedIds =
        new Map();

    const events =
        (
            source.events ?? []
        ).map(
            (
                event,
                index
            ) =>
                normaliseEvent(
                    event,
                    index,
                    travellers,
                    groups,
                    places,
                    placeAliases,
                    usedIds
                )
        );

    const wishlist =
        normaliseWishlist(
            source.wishlist ?? [],
            placeAliases
        );

    return {
        travellers,
        groups,
        places,
        events,
        wishlist
    };
}


// Wishlist entries: "place | optional locations", e.g. "JP | Tokyo, Kyoto".
function normaliseWishlist(
    source,
    placeAliases
) {
    const wishlist =
        new Map();

    source.forEach(
        (
            raw,
            index
        ) => {
            const [
                placeValue,
                locationValue = ""
            ] =
                String(raw)
                    .split("|")
                    .map(
                        part =>
                            part.trim()
                    );

            const code =
                placeAliases.get(
                    placeValue.toUpperCase()
                );

            if (
                !code
            ) {
                throw new Error(
                    `Unknown place "${placeValue}" in wishlist entry ${index + 1}.`
                );
            }

            wishlist.set(
                code,
                locationValue
            );
        }
    );

    return wishlist;
}


function normaliseTravellers(
    source = {}
) {
    const travellers = {};

    for (
        const [
            id,
            value
        ]
        of Object.entries(
            source
        )
    ) {
        const key =
            id
                .trim()
                .toLowerCase();

        travellers[key] = {
            name:
                typeof value ===
                "string"
                    ? value
                    : value?.name ??
                      key
        };
    }

    return travellers;
}


function normaliseGroups(
    source,
    travellers
) {
    const groups = {};

    for (
        const [
            groupIdRaw,
            value
        ]
        of Object.entries(
            source
        )
    ) {
        const groupId =
            groupIdRaw
                .trim()
                .toLowerCase();

        const members =
            Array.isArray(value)
                ? value
                : String(value)
                    .trim()
                    .split(/\s+/);

        const normalisedMembers =
            members.map(
                member =>
                    String(
                        member
                    )
                        .trim()
                        .toLowerCase()
            );

        normalisedMembers
            .forEach(
                member => {
                    if (
                        !travellers[
                            member
                        ]
                    ) {
                        throw new Error(
                            `Unknown traveller "${member}" in group "${groupId}".`
                        );
                    }
                }
            );

        groups[groupId] =
            normalisedMembers;
    }

    return groups;
}


function normalisePlaces(
    source
) {
    const places = {};
    const placeAliases =
        new Map();

    const countryCodes =
        new Set(
            Object
                .keys(source)
                .map(
                    code =>
                        code
                            .toUpperCase()
                )
        );

    for (
        const [
            countryCodeRaw,
            value
        ]
        of Object.entries(
            source
        )
    ) {
        const countryCode =
            countryCodeRaw
                .toUpperCase();

        const country =
            typeof value ===
            "string"
                ? {
                    name: value
                }
                : {
                    name:
                        value.name,
                    regions: {}
                };

        places[countryCode] =
            country;

        placeAliases.set(
            countryCode,
            countryCode
        );

        if (
            typeof value !==
                "object" ||
            !value.regions
        ) {
            continue;
        }

        for (
            const [
                regionCodeRaw,
                regionValue
            ]
            of Object.entries(
                value.regions
            )
        ) {
            const regionCode =
                regionCodeRaw
                    .toUpperCase();

            const fullCode =
                `${countryCode}-${regionCode}`;

            const regionName =
                typeof regionValue ===
                "string"
                    ? regionValue
                    : regionValue.name;

            country
                .regions[
                    fullCode
                ] = {
                    name:
                        regionName
                };

            placeAliases.set(
                fullCode,
                fullCode
            );

            if (
                !countryCodes
                    .has(
                        regionCode
                    )
            ) {
                registerPlaceAlias(
                    placeAliases,
                    regionCode,
                    fullCode
                );
            }
        }
    }

    return {
        places,
        placeAliases
    };
}


function registerPlaceAlias(
    aliases,
    alias,
    fullCode
) {
    if (
        aliases.has(alias) &&
        aliases.get(alias) !==
            fullCode
    ) {
        throw new Error(
            `Ambiguous place abbreviation "${alias}". Use the full region code instead.`
        );
    }

    aliases.set(
        alias,
        fullCode
    );
}


function normaliseEvent(
    raw,
    index,
    travellers,
    groups,
    places,
    placeAliases,
    usedIds
) {
    if (
        typeof raw !==
        "string"
    ) {
        throw new Error(
            `Event ${index + 1} must be a pipe-separated string.`
        );
    }

    const parts =
        raw
            .split("|")
            .map(
                part =>
                    part.trim()
            );

    if (
        parts.length < 4 ||
        parts.length > 5
    ) {
        throw new Error(
            `Event ${index + 1} must have 4 or 5 fields: "date | place | travellers | locations | optional note".`
        );
    }

    const [
        dateValue,
        placeValue,
        travellerValue,
        locationValue,
        noteValue
    ] = parts;

    const temporal =
        parseEventDate(
            dateValue,
            index
        );

    const place =
        resolvePlace(
            placeValue,
            placeAliases,
            index
        );

    const eventTravellers =
        resolveTravellers(
            travellerValue,
            travellers,
            groups,
            index
        );

    const locations =
        locationValue
            ? locationValue
                .split(",")
                .map(
                    value =>
                        value.trim()
                )
                .filter(Boolean)
            : [];

    const event = {
        place,
        travellers:
            eventTravellers,
        locations,
        year:
            temporal.year,
        precision:
            temporal.precision
    };

    if (
        temporal.date
    ) {
        event.date =
            temporal.date;
    }

    if (
        noteValue
    ) {
        event.notes =
            noteValue;
    }

    event.id =
        generateEventId(
            event,
            usedIds
        );

    return event;
}


function parseEventDate(
    value,
    index
) {
    value =
        String(value)
            .trim();

    if (
        /^\d{4}$/.test(
            value
        )
    ) {
        return {
            year:
                Number(value),
            precision:
                "year"
        };
    }

    if (
        /^\d{4}-\d{2}$/
            .test(value)
    ) {
        const [
            year,
            month
        ] =
            value
                .split("-")
                .map(Number);

        if (
            month < 1 ||
            month > 12
        ) {
            throw new Error(
                `Invalid month "${value}" in event ${index + 1}.`
            );
        }

        return {
            date: value,
            year,
            precision:
                "month"
        };
    }

    if (
        /^\d{4}-\d{2}-\d{2}$/
            .test(value)
    ) {
        const [
            year,
            month,
            day
        ] =
            value
                .split("-")
                .map(Number);

        const date =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );

        if (
            date
                .getUTCFullYear()
                !== year ||
            date
                .getUTCMonth()
                !== month - 1 ||
            date
                .getUTCDate()
                !== day
        ) {
            throw new Error(
                `Invalid date "${value}" in event ${index + 1}.`
            );
        }

        return {
            date: value,
            year,
            precision:
                "day"
        };
    }

    throw new Error(
        `Invalid date/year "${value}" in event ${index + 1}.`
    );
}


function getTodayUtc() {
    const now =
        new Date();

    return new Date(
        Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        )
    );
}


function getEventStartDate(
    event
) {
    if (
        event.precision ===
        "day"
    ) {
        const [
            year,
            month,
            day
        ] =
            event.date
                .split("-")
                .map(Number);

        return new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );
    }

    if (
        event.precision ===
        "month"
    ) {
        const [
            year,
            month
        ] =
            event.date
                .split("-")
                .map(Number);

        return new Date(
            Date.UTC(
                year,
                month - 1,
                1
            )
        );
    }

    return new Date(
        Date.UTC(
            event.year,
            0,
            1
        )
    );
}


function isPlannedEvent(
    event
) {
    return (
        getEventStartDate(
            event
        ) >
        getTodayUtc()
    );
}


function displayEventDate(
    event
) {
    if (
        event.precision ===
        "day"
    ) {
        const [
            year,
            month,
            day
        ] =
            event.date
                .split("-")
                .map(Number);

        return new Intl
            .DateTimeFormat(
                "en-GB",
                {
                    day:
                        "numeric",
                    month:
                        "long",
                    year:
                        "numeric",
                    timeZone:
                        "UTC"
                }
            )
            .format(
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
                )
            );
    }

    if (
        event.precision ===
        "month"
    ) {
        const [
            year,
            month
        ] =
            event.date
                .split("-")
                .map(Number);

        return new Intl
            .DateTimeFormat(
                "en-GB",
                {
                    month:
                        "long",
                    year:
                        "numeric",
                    timeZone:
                        "UTC"
                }
            )
            .format(
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        1
                    )
                )
            );
    }

    return String(
        event.year
    );
}


function eventSortKey(
    event
) {
    if (
        event.precision ===
        "day"
    ) {
        return event.date;
    }

    if (
        event.precision ===
        "month"
    ) {
        return (
            `${event.date}-01`
        );
    }

    return (
        `${event.year}-01-01`
    );
}


function compareEvents(
    a,
    b
) {
    return eventSortKey(b)
        .localeCompare(
            eventSortKey(a)
        );
}


function groupEventsByDate(
    events
) {
    const groups = [];

    for (
        const event
        of events
    ) {
        const key =
            eventDateGroupKey(
                event
            );

        let group =
            groups.at(-1);

        if (
            !group ||
            group.key !== key
        ) {
            group = {
                key,
                label:
                    displayEventDate(
                        event
                    ),
                events: []
            };

            groups.push(
                group
            );
        }

        group.events.push(
            event
        );
    }

    return groups;
}


function eventDateGroupKey(
    event
) {
    if (
        event.precision ===
        "day"
    ) {
        return event.date;
    }

    if (
        event.precision ===
        "month"
    ) {
        return event.date;
    }

    return String(
        event.year
    );
}


function resolvePlace(
    value,
    aliases,
    index
) {
    const code =
        value
            .trim()
            .toUpperCase();

    const resolved =
        aliases.get(code);

    if (
        !resolved
    ) {
        throw new Error(
            `Unknown place "${value}" in event ${index + 1}.`
        );
    }

    return resolved;
}


function resolveTravellers(
    value,
    travellers,
    groups,
    index
) {
    const tokens =
        value
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

    const resolved = [];

    for (
        const token
        of tokens
    ) {
        if (
            groups[token]
        ) {
            resolved.push(
                ...groups[token]
            );

            continue;
        }

        if (
            travellers[token]
        ) {
            resolved.push(
                token
            );

            continue;
        }

        throw new Error(
            `Unknown traveller/group "${token}" in event ${index + 1}.`
        );
    }

    return [
        ...new Set(
            resolved
        )
    ];
}


function generateEventId(
    event,
    usedIds
) {
    const date =
        event.date ??
        String(
            event.year
        );

    const base = [
        date,
        event.place,
        ...event.travellers
    ]
        .join("-")
        .toLowerCase()
        .replace(
            /[^a-z0-9-]+/g,
            "-"
        )
        .replace(
            /-+/g,
            "-"
        );

    const count =
        (
            usedIds
                .get(base) ??
            0
        ) + 1;

    usedIds.set(
        base,
        count
    );

    return (
        count === 1
            ? base
            : `${base}-${count}`
    );
}


function getPlace(
    placeCode
) {
    if (
        !travelData
    ) {
        return null;
    }

    const country =
        travelData
            .places[
                placeCode
            ];

    if (
        country
    ) {
        return {
            code:
                placeCode,
            name:
                country.name,
            countryCode:
                placeCode,
            countryName:
                country.name
        };
    }

    for (
        const [
            countryCode,
            countryData
        ]
        of Object.entries(
            travelData.places
        )
    ) {
        const region =
            countryData
                .regions
                ?.[
                    placeCode
                ];

        if (
            region
        ) {
            return {
                code:
                    placeCode,
                name:
                    region.name,
                countryCode,
                countryName:
                    countryData.name
            };
        }
    }

    return {
        code:
            placeCode,
        name:
            placeCode,
        countryCode:
            null,
        countryName:
            null
    };
}


function eventMatchesPlace(
    event,
    placeCode
) {
    if (
        event.place ===
        placeCode
    ) {
        return true;
    }

    const eventPlace =
        getPlace(
            event.place
        );

    return (
        eventPlace
            ?.countryCode ===
        placeCode
    );
}


function travellerName(
    id
) {
    return (
        travelData
            ?.travellers[id]
            ?.name ??
        id
    );
}


function isFamilyEvent(
    event
) {
    const familyMembers =
        travelData
            ?.groups
            ?.family ??
        [];

    if (
        !familyMembers.length
    ) {
        return false;
    }

    return familyMembers
        .every(
            id =>
                event
                    .travellers
                    .includes(id)
        );
}


function getEvents(
    placeCode = null,
    travellerId = "all"
) {
    if (
        !travelData
    ) {
        return [];
    }

    return travelData
        .events
        .filter(
            event => {
                const matchesPlace =
                    placeCode
                        ? eventMatchesPlace(
                            event,
                            placeCode
                        )
                        : true;

                let matchesTraveller =
                    true;

                if (
                    travellerId ===
                    "family"
                ) {
                    matchesTraveller =
                        isFamilyEvent(
                            event
                        );
                }
                else if (
                    travellerId !==
                    "all"
                ) {
                    matchesTraveller =
                        event
                            .travellers
                            .includes(
                                travellerId
                            );
                }

                return (
                    matchesPlace &&
                    matchesTraveller
                );
            }
        )
        .slice()
        .sort(
            compareEvents
        );
}


function getVisitedCountryCount(
    travellerId = "all"
) {
    const countries =
        new Set();

    for (
        const event
        of getEvents(
            null,
            travellerId
        )
    ) {
        if (
            isPlannedEvent(
                event
            )
        ) {
            continue;
        }

        const place =
            getPlace(
                event.place
            );

        if (
            place
                ?.countryCode
        ) {
            countries.add(
                place
                    .countryCode
            );
        }
    }

    return countries.size;
}


function getPlannedCountryCount(
    travellerId = "all"
) {
    const visited =
        new Set();

    const planned =
        new Set();

    for (
        const event
        of getEvents(
            null,
            travellerId
        )
    ) {
        const place =
            getPlace(
                event.place
            );

        if (
            !place
                ?.countryCode
        ) {
            continue;
        }

        if (
            isPlannedEvent(
                event
            )
        ) {
            planned.add(
                place
                    .countryCode
            );
        }
        else {
            visited.add(
                place
                    .countryCode
            );
        }
    }

    for (
        const country
        of visited
    ) {
        planned.delete(
            country
        );
    }

    return planned.size;
}


function renderStats() {
    if (
        !statsTarget
    ) {
        return;
    }

    const visited =
        getVisitedCountryCount(
            activeTraveller
        );

    const planned =
        getPlannedCountryCount(
            activeTraveller
        );

    let text =
        `${visited} ${
            visited === 1
                ? "country"
                : "countries"
        } visited`;

    if (
        planned > 0
    ) {
        text +=
            ` ·${planned} new ${
                planned === 1
                    ? "country"
                    : "countries"
            } planned`;
    }

    statsTarget
        .textContent =
            text;
}


function getVisitors(
    placeCode
) {
    return [
        ...new Set(
            getEvents(
                placeCode,
                "all"
            ).flatMap(
                event =>
                    event
                        .travellers
            )
        )
    ];
}


function renderTravelMap() {
    if (
        !travelData ||
        !mapDocument
    ) {
        return;
    }

    mapDocument
        .querySelectorAll(
            ".country.visited, .state.visited, .country.planned, .state.planned, .country.wishlist, .state.wishlist"
        )
        .forEach(
            element =>
                element
                    .classList
                    .remove(
                        "visited",
                        "planned",
                        "wishlist"
                    )
        );

    for (
        const [
            countryCode,
            country
        ]
        of Object.entries(
            travelData.places
        )
    ) {
        const regions =
            country.regions ??
            {};

        if (
            Object.keys(
                regions
            ).length
        ) {
            mapDocument
                .getElementById(
                    countryCode
                )
                ?.classList
                .add(
                    "granular"
                );

            for (
                const regionCode
                of Object.keys(
                    regions
                )
            ) {
                applyMapStatus(
                    regionCode,
                    getEvents(
                        regionCode,
                        activeTraveller
                    )
                );
            }

            continue;
        }

        applyMapStatus(
            countryCode,
            getEvents(
                countryCode,
                activeTraveller
            )
        );
    }

    applyWishlistStatus();
    applyStripes();
}


const statusColours = {
    visited: "#294530",
    planned: "#7B0323",
    wishlist: "#1f5fa8"
};


// Places with more than one status get diagonal stripes, one per colour.
function applyStripes() {
    const svgNs =
        "http://www.w3.org/2000/svg";

    let defs =
        mapDocument.querySelector(
            "defs"
        );

    if (
        !defs
    ) {
        defs =
            mapDocument.createElementNS(
                svgNs,
                "defs"
            );

        mapDocument
            .documentElement
            .prepend(
                defs
            );
    }

    mapDocument
        .querySelectorAll(
            ".country, .state"
        )
        .forEach(
            element => {
                element.style.fill = "";

                const statuses =
                    Object.keys(
                        statusColours
                    ).filter(
                        status =>
                            element.classList.contains(
                                status
                            )
                    );

                if (
                    statuses.length < 2
                ) {
                    return;
                }

                const id =
                    `stripes-${statuses.join("-")}`;

                if (
                    !mapDocument.getElementById(
                        id
                    )
                ) {
                    const width = 6;

                    const pattern =
                        mapDocument.createElementNS(
                            svgNs,
                            "pattern"
                        );

                    pattern.setAttribute("id", id);
                    pattern.setAttribute("patternUnits", "userSpaceOnUse");
                    pattern.setAttribute("width", width * statuses.length);
                    pattern.setAttribute("height", 10);
                    pattern.setAttribute("patternTransform", "rotate(45)");

                    statuses.forEach(
                        (
                            status,
                            index
                        ) => {
                            const rect =
                                mapDocument.createElementNS(
                                    svgNs,
                                    "rect"
                                );

                            rect.setAttribute("x", index * width);
                            rect.setAttribute("width", width);
                            rect.setAttribute("height", 10);
                            rect.setAttribute("fill", statusColours[status]);

                            pattern.append(
                                rect
                            );
                        }
                    );

                    defs.append(
                        pattern
                    );
                }

                element.style.fill =
                    `url(#${id})`;
            }
        );
}


// Wishlist places are blue; mixed statuses become stripes.
function applyWishlistStatus() {
    for (
        const code
        of travelData.wishlist.keys()
    ) {
        const regions =
            Object.keys(
                travelData
                    .places[code]
                    ?.regions ??
                {}
            );

        for (
            const placeCode
            of regions.length
                ? regions
                : [code]
        ) {
            const element =
                mapDocument
                    .getElementById(
                        placeCode
                    );

            if (
                element
            ) {
                element
                    .classList
                    .add(
                        "wishlist"
                    );
            }
        }
    }
}


function applyMapStatus(
    placeCode,
    events
) {
    if (
        !events.length
    ) {
        return;
    }

    const element =
        mapDocument
            .getElementById(
                placeCode
            );

    if (
        !element
    ) {
        return;
    }

    if (
        events.some(
            event =>
                !isPlannedEvent(
                    event
                )
        )
    ) {
        element
            .classList
            .add(
                "visited"
            );
    }

    if (
        events.some(
            isPlannedEvent
        )
    ) {
        element
            .classList
            .add(
                "planned"
            );
    }
}


function renderPlaceDetails(
    placeCode
) {
    if (
        !travelData
    ) {
        return;
    }

    const place =
        getPlace(
            placeCode
        );

    const events =
        getEvents(
            placeCode,
            activeTraveller
        );

    if (
        !events.length
    ) {
        detailsTarget.innerHTML = `
            <h2>
                ${escapeHtml(
                    place.name
                )}
            </h2>

            <p>
                No recorded visits for
                ${escapeHtml(
                    getFilterLabel()
                )}.
            </p>
        `;

        if (
            travelData.wishlist.has(
                placeCode
            )
        ) {
            const locations =
                travelData.wishlist.get(
                    placeCode
                );

            detailsTarget.innerHTML += `
                <p class="wishlist-label">
                    On the wishlist${
                        locations
                            ? `: ${escapeHtml(locations)}`
                            : ""
                    }.
                </p>
            `;
        }

        return;
    }

    const visitors = [
        ...new Set(
            events.flatMap(
                event =>
                    event
                        .travellers
            )
        )
    ].map(
        travellerName
    );

    detailsTarget.innerHTML = `
        <h2>
            ${escapeHtml(
                place.name
            )}
        </h2>

        <p>
            ${events.length}
            ${
                events.length === 1
                    ? "event"
                    : "events"
            }
            recorded.
            ${escapeHtml(
                formatNames(
                    visitors
                )
            )}.
        </p>

        <ol class="visit-history">
            ${events
                .map(
                    renderCompactEvent
                )
                .join("")}
        </ol>
    `;
}


function renderCompactEvent(
    event
) {
    const people =
        event
            .travellers
            .map(
                travellerName
            );

    const locations =
        event
            .locations
            .length
                ? ` · ${
                    event
                        .locations
                        .map(
                            escapeHtml
                        )
                        .join(
                            " · "
                        )
                }`
                : "";

    const planned =
        isPlannedEvent(
            event
        );

    return `
        <li class="${planned ? "planned" : ""}">
            <strong>
                ${escapeHtml(
                    displayEventDate(
                        event
                    )
                )}
            </strong>

            ·

            ${escapeHtml(
                formatNames(
                    people
                )
            )}

            ${locations}

            ${
                planned
                    ? `<span class="planned-label">Planned</span>`
                    : ""
            }
        </li>
    `;
}


function renderAllHistory() {
    if (
        !travelData
    ) {
        return;
    }

    const events =
        getEvents(
            null,
            activeTraveller
        );

    let label;

    if (
        activeTraveller ===
        "all"
    ) {
        label =
            "All recorded travel";
    }
    else if (
        activeTraveller ===
        "family"
    ) {
        label =
            "Trips attended by the whole family";
    }
    else {
        label =
            `${travellerName(
                activeTraveller
            )}'s recorded travel`;
    }

    historySummary
        .textContent =
            `${label}. ` +
            `${events.length} ` +
            `${
                events.length === 1
                    ? "event"
                    : "events"
            }.`;

    if (
        !events.length
    ) {
        historyTarget
            .innerHTML =
                "<li>No recorded travel.</li>";

        return;
    }

    const groups =
        groupEventsByDate(
            events
        );

    historyTarget
        .innerHTML =
            groups
                .map(
                    renderHistoryGroup
                )
                .join("");
}


function renderHistoryGroup(
    group
) {
    return `
        <li class="history-group">

            <div class="event-date">
                ${escapeHtml(
                    group.label
                )}
            </div>

            <div class="history-group-events">
                ${group.events
                    .map(
                        renderHistoryGroupEvent
                    )
                    .join("")}
            </div>

        </li>
    `;
}


function renderHistoryGroupEvent(
    event
) {
    const place =
        getPlace(
            event.place
        );

    const people =
        event
            .travellers
            .map(
                travellerName
            );

    const placeText =
        place.countryName &&
        place.countryName !==
            place.name
            ? `${place.name}, ${place.countryName}`
            : place.name;

    const locations =
        event
            .locations
            .length
                ? `
                    <div class="event-locations">
                        ${event
                            .locations
                            .map(
                                escapeHtml
                            )
                            .join(
                                " · "
                            )}
                    </div>
                `
                : "";

    const notes =
        event.notes
            ? `
                <div class="event-notes">
                    ${escapeHtml(
                        event.notes
                    )}
                </div>
            `
            : "";

    const planned =
        isPlannedEvent(
            event
        );

    return `
        <div class="history-event ${planned ? "planned" : ""}">

            <div class="event-place">
                ${escapeHtml(
                    placeText
                )}

                ${
                    planned
                        ? `<span class="planned-label">Planned</span>`
                        : ""
                }
            </div>

            <div class="event-people">
                ${escapeHtml(
                    formatNames(
                        people
                    )
                )}
            </div>

            ${locations}
            ${notes}

        </div>
    `;
}


function getFilterLabel() {
    if (
        activeTraveller ===
        "all"
    ) {
        return (
            "all recorded travel"
        );
    }

    if (
        activeTraveller ===
        "family"
    ) {
        return (
            "trips attended by the whole family"
        );
    }

    return travellerName(
        activeTraveller
    );
}


function initialiseFilters() {
    document
        .querySelectorAll(
            "[data-traveller]"
        )
        .forEach(
            button => {
                button
                    .addEventListener(
                        "click",
                        () => {
                            activeTraveller =
                                button
                                    .dataset
                                    .traveller;

                            document
                                .querySelectorAll(
                                    "[data-traveller]"
                                )
                                .forEach(
                                    other =>
                                        other
                                            .setAttribute(
                                                "aria-pressed",
                                                String(
                                                    other ===
                                                    button
                                                )
                                            )
                                );

                            renderTravelMap();
                            renderAllHistory();
                            renderStats();

                            detailsTarget
                                .innerHTML = `
                                    <h2>
                                        Select a country or state
                                    </h2>

                                    <p>
                                        The map and travel history
                                        are filtered to
                                        ${escapeHtml(
                                            getFilterLabel()
                                        )}.
                                    </p>
                                `;
                        }
                    );
            }
        );
}


function attachMapEvents() {
    mapDocument
        .querySelectorAll(
            ".country, .state"
        )
        .forEach(
            element => {
                const placeCode =
                    element.id;

                const activate =
                    () =>
                        renderPlaceDetails(
                            placeCode
                        );

                element
                    .addEventListener(
                        "click",
                        activate
                    );

                element
                    .addEventListener(
                        "keydown",
                        event => {
                            if (
                                event.key !==
                                    "Enter" &&
                                event.key !==
                                    " "
                            ) {
                                return;
                            }

                            event
                                .preventDefault();

                            activate();
                        }
                    );
            }
        );
}


function formatNames(
    names
) {
    if (
        !names.length
    ) {
        return "";
    }

    if (
        names.length === 1
    ) {
        return names[0];
    }

    if (
        names.length === 2
    ) {
        return (
            `${names[0]} and ${names[1]}`
        );
    }

    return (
        `${names
            .slice(0, -1)
            .join(", ")} and ` +
        names.at(-1)
    );
}


function escapeHtml(
    value
) {
    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


async function initialise() {
    try {
        await loadTravelData();

        initialiseFilters();

        renderAllHistory();
        renderStats();

        if (
            mapObject
                .contentDocument
        ) {
            mapDocument =
                mapObject
                    .contentDocument;

            attachMapEvents();
            renderTravelMap();
        }
    }
    catch (
        error
    ) {
        console.error(
            error
        );

        loadError.hidden =
            false;

        loadError.textContent =
            error.message;
    }
}


mapObject
    .addEventListener(
        "load",
        () => {
            mapDocument =
                mapObject
                    .contentDocument;

            if (
                !travelData ||
                !mapDocument
            ) {
                return;
            }

            attachMapEvents();
            renderTravelMap();
        }
    );


initialise();
