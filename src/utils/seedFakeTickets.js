import { faker } from "@faker-js/faker";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";

import {
    OFFICES,
    ISSUE_CATEGORIES,
} from "../data/offices";

const STATUSES = [
    "Open",
    "In Progress",
    "Resolved",
    "Closed",
];

const getRandomItem = (array) =>
    array[Math.floor(Math.random() * array.length)];

const generateRandomDate = () => {
    const now = new Date();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    return faker.date.between({
        from: sixMonthsAgo,
        to: now,
    });
};

const generateDescription = (category) => {
    const descriptions = {
        Monitor: [
            "Monitor display is flickering.",
            "No display detected.",
            "Screen remains black after startup.",
        ],

        Printer: [
            "Printer is not responding.",
            "Paper jam error.",
            "Unable to print documents.",
        ],

        Keyboard: [
            "Several keys are not functioning.",
            "Keyboard disconnects intermittently.",
        ],

        Mouse: [
            "Mouse cursor is freezing.",
            "Mouse not detected.",
        ],

        "Network / Internet": [
            "Unable to access internet.",
            "Intermittent network connectivity.",
            "Slow internet speed.",
        ],

        "Software / Application": [
            "Application crashes during startup.",
            "Software license issue.",
            "Unable to login to application.",
        ],

        Laptop: [
            "Laptop overheating issue.",
            "Battery not charging.",
        ],

        Server: [
            "Server inaccessible.",
            "Shared drive unavailable.",
        ],

        Other: [
            "General technical assistance required.",
            "Unknown system issue encountered.",
        ],
    };

    return getRandomItem(
        descriptions[category] || [
            "Technical issue reported.",
        ]
    );
};

export async function seedFakeTickets(
    count = 200
) {
    try {
        const ticketsRef = collection(
            db,
            "tickets"
        );

        for (let i = 1; i <= count; i++) {
            const office =
                getRandomItem(OFFICES);

            const category =
                getRandomItem(
                    ISSUE_CATEGORIES
                );

            const urgency =
                getRandomItem([
                    "Low",
                    "Medium",
                    "High",
                ]);

            const status =
                getRandomItem(STATUSES);

            const createdAt =
                generateRandomDate();

            const updatedAt =
                faker.date.between({
                    from: createdAt,
                    to: new Date(),
                });

            const resolved =
                status === "Resolved" ||
                status === "Closed";

            await addDoc(
                ticketsRef,
                {
                    ticketId: `DA-IT-2026-${String(
                        i
                    ).padStart(5, "0")}`,

                    firstName:
                        faker.person.firstName(),

                    lastName:
                        faker.person.lastName(),

                    email:
                        faker.internet.email(),

                    contactNumber: `09${faker.string.numeric(
                        9
                    )}`,

                    office: office.value,

                    officeLabel:
                        office.label,

                    department:
                        office.label,

                    location:
                        faker.location.city(),

                    deviceName: faker.helpers.arrayElement(
                        [
                            "Dell OptiPlex",
                            "HP ProDesk",
                            "Lenovo ThinkPad",
                            "Acer Aspire",
                            "Brother Printer",
                            "Epson L3210",
                        ]
                    ),

                    issueCategory:
                        category,

                    description:
                        generateDescription(
                            category
                        ),

                    urgency,

                    status,

                    assignedTechnician:
                        faker.helpers.arrayElement(
                            [
                                "Juan Cruz",
                                "Maria Santos",
                                "Pedro Reyes",
                                null,
                            ]
                        ),

                    resolutionSummary:
                        resolved
                            ? faker.lorem.sentence()
                            : "",

                    actionTaken:
                        resolved
                            ? faker.lorem.paragraph()
                            : "",

                    resolvedBy:
                        resolved
                            ? faker.helpers.arrayElement(
                                [
                                    "Juan Cruz",
                                    "Maria Santos",
                                    "Pedro Reyes",
                                ]
                            )
                            : "",

                    resolvedDate:
                        resolved
                            ? updatedAt
                            : null,

                    createdAt,
                    updatedAt,
                }
            );
        }

        console.log(
            `Successfully generated ${count} tickets`
        );
    } catch (error) {
        console.error(
            "Seeder Error:",
            error
        );
    }
}