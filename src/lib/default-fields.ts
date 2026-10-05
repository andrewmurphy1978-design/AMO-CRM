import type { FieldTpl } from "@/lib/project-templates";

// The custom fields of each project type as customized on the Project Type Customization page
// (copied from the saved templates): these are the defaults a fresh install and "Reset" use.
export const DEFAULT_FIELDS: Record<string, FieldTpl[]> = {
  "APP": [
    {
      "key": "appKind",
      "type": "select",
      "label": "App type",
      "options": [
        "Native",
        "Cross-platform",
        "Progressive Web App (PWA)",
        "Hybrid (web in a native shell)",
        "Web app"
      ]
    },
    {
      "key": "platforms",
      "type": "multiselect",
      "label": "Platforms",
      "options": [
        "iOS",
        "Android",
        "Web",
        "Windows",
        "macOS",
        "Wearable"
      ],
      "optionsBy": {
        "map": {
          "*": [
            "iOS",
            "Android",
            "Web",
            "Windows",
            "macOS",
            "Wearable"
          ],
          "Native": [
            "iOS",
            "Android",
            "macOS",
            "Windows",
            "Wearable"
          ],
          "Web app": [
            "Web"
          ],
          "Cross-platform": [
            "iOS",
            "Android",
            "Web",
            "macOS",
            "Windows"
          ],
          "Progressive Web App (PWA)": [
            "Web"
          ],
          "Hybrid (web in a native shell)": [
            "iOS",
            "Android",
            "Web"
          ]
        },
        "field": "appKind"
      }
    },
    {
      "key": "minOs",
      "type": "text",
      "label": "Minimum OS versions"
    },
    {
      "key": "framework",
      "type": "multiselect",
      "label": "App framework / language",
      "options": [
        "Swift / SwiftUI",
        "Kotlin / Jetpack Compose",
        "React Native",
        "Expo",
        "Flutter",
        "Ionic / Capacitor",
        ".NET MAUI",
        "Unity",
        "React",
        "Next.js",
        "Vue / Nuxt",
        "Angular",
        "Svelte"
      ],
      "allowOther": true
    },
    {
      "key": "uiKit",
      "type": "select",
      "label": "UI kit / design system",
      "options": [
        "Material Design",
        "Apple Human Interface (Cupertino)",
        "Tailwind / custom",
        "Existing brand design system"
      ],
      "allowOther": true
    },
    {
      "key": "screens",
      "type": "number",
      "label": "Number of screens"
    },
    {
      "key": "backend",
      "type": "multiselect",
      "label": "Back end",
      "options": [
        "Node.js",
        "Python (Django / FastAPI)",
        "PHP (Laravel)",
        "Ruby on Rails",
        "Java / Spring",
        ".NET",
        "Go",
        "Serverless (Cloudflare Workers / AWS Lambda)",
        "Firebase",
        "Supabase",
        "Appwrite",
        "No back end"
      ],
      "allowOther": true
    },
    {
      "key": "apiStyle",
      "type": "select",
      "label": "API style",
      "options": [
        "REST",
        "GraphQL",
        "tRPC",
        "WebSockets / real-time",
        "gRPC"
      ],
      "allowOther": true
    },
    {
      "key": "database",
      "type": "multiselect",
      "label": "Database",
      "options": [
        "PostgreSQL",
        "MySQL / MariaDB",
        "MongoDB",
        "SQLite",
        "Firestore",
        "DynamoDB",
        "Redis",
        "Realm",
        "Supabase",
        "No database"
      ],
      "allowOther": true
    },
    {
      "app": true,
      "key": "databaseProvider",
      "type": "select",
      "label": "Database provider",
      "showIf": {
        "op": "notEmpty",
        "field": "database"
      },
      "options": [
        "Neon",
        "Supabase",
        "AWS (RDS / Aurora / DynamoDB)",
        "Google Cloud SQL / Firebase",
        "Azure",
        "MongoDB Atlas",
        "PlanetScale",
        "Railway",
        "Render",
        "DigitalOcean",
        "Self-hosted"
      ],
      "allowOther": true
    },
    {
      "key": "orm",
      "type": "select",
      "label": "ORM / data layer",
      "showIf": {
        "op": "notEmpty",
        "field": "database"
      },
      "options": [
        "Prisma",
        "Drizzle",
        "TypeORM",
        "Sequelize",
        "SQLAlchemy / Django ORM",
        "Eloquent",
        "Mongoose",
        "None"
      ],
      "allowOther": true
    },
    {
      "key": "offline",
      "type": "yesno",
      "label": "Works offline / sync"
    },
    {
      "app": true,
      "key": "hosting",
      "type": "multiselect",
      "label": "Hosting / cloud",
      "options": [
        "Cloudflare",
        "AWS",
        "Google Cloud",
        "Azure",
        "Vercel",
        "Netlify",
        "Firebase",
        "DigitalOcean",
        "Railway",
        "Render",
        "Fly.io",
        "Self-hosted VPS"
      ],
      "allowOther": true
    },
    {
      "key": "environments",
      "type": "multiselect",
      "label": "Environments",
      "options": [
        "Development",
        "Staging",
        "Production"
      ]
    },
    {
      "app": true,
      "key": "storage",
      "type": "multiselect",
      "label": "File / media storage",
      "options": [
        "AWS S3",
        "Cloudflare R2",
        "Firebase Storage",
        "Supabase Storage",
        "Cloudinary",
        "Google Cloud Storage"
      ],
      "allowOther": true
    },
    {
      "key": "authMethods",
      "type": "multiselect",
      "label": "Sign-in methods",
      "options": [
        "Email & password",
        "Google",
        "Apple",
        "Facebook",
        "Phone / SMS code",
        "Magic link",
        "Passkeys",
        "SSO / SAML"
      ],
      "allowOther": true
    },
    {
      "app": true,
      "key": "authProvider",
      "type": "select",
      "label": "Authentication service",
      "options": [
        "Firebase Auth",
        "Auth0",
        "Clerk",
        "Supabase Auth",
        "AWS Cognito",
        "NextAuth / Auth.js",
        "Custom"
      ],
      "allowOther": true
    },
    {
      "app": true,
      "key": "payments",
      "type": "multiselect",
      "label": "Payments",
      "options": [
        "Stripe",
        "PayPal",
        "Square",
        "Apple In-App Purchase",
        "Google Play Billing",
        "RevenueCat",
        "No payments"
      ],
      "allowOther": true
    },
    {
      "key": "features",
      "type": "multiselect",
      "label": "Features",
      "options": [
        "User login",
        "Payments",
        "Notifications",
        "Admin dashboard",
        "API integration",
        "Analytics",
        "Chat / messaging",
        "Maps / geolocation",
        "Camera / media upload",
        "AI features",
        "Booking / calendar",
        "Search",
        "Multi-language"
      ],
      "allowOther": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "app": true,
      "key": "notifications",
      "type": "multiselect",
      "label": "Notifications & messaging",
      "options": [
        "Firebase Cloud Messaging",
        "Apple Push (APNs)",
        "OneSignal",
        "Expo Push",
        "SendGrid",
        "Mailgun",
        "Postmark",
        "Twilio SMS"
      ],
      "allowOther": true
    },
    {
      "app": true,
      "key": "thirdParty",
      "type": "multiselect",
      "label": "Third-party APIs",
      "options": [
        "Google Maps",
        "Mapbox",
        "OpenAI / Claude AI",
        "Twilio",
        "Zapier / Make",
        "Calendly",
        "Algolia",
        "Systeme.io"
      ],
      "allowOther": true
    },
    {
      "key": "analytics",
      "type": "multiselect",
      "label": "Analytics & monitoring",
      "options": [
        "Firebase Analytics",
        "Google Analytics",
        "Mixpanel",
        "PostHog",
        "Amplitude",
        "Sentry",
        "Crashlytics"
      ],
      "allowOther": true
    },
    {
      "app": true,
      "key": "repo",
      "type": "select",
      "label": "Code repository",
      "options": [
        "GitHub",
        "GitLab",
        "Bitbucket",
        "Client's own"
      ]
    },
    {
      "app": false,
      "key": "cicd",
      "type": "multiselect",
      "label": "CI/CD & builds",
      "options": [
        "GitHub Actions",
        "GitLab CI",
        "Bitrise",
        "Codemagic",
        "Fastlane",
        "Expo EAS",
        "Cloudflare / Vercel auto-deploy"
      ],
      "allowOther": true
    },
    {
      "key": "testing",
      "type": "multiselect",
      "label": "Testing",
      "options": [
        "Unit tests",
        "End-to-end tests",
        "Device lab / real devices",
        "Beta testers (TestFlight / Play testing)",
        "Accessibility audit",
        "Load testing"
      ]
    },
    {
      "key": "compliance",
      "type": "multiselect",
      "label": "Privacy & compliance",
      "options": [
        "Law 25 (Québec)",
        "PIPEDA",
        "GDPR",
        "CCPA",
        "HIPAA",
        "PCI-DSS",
        "Accessibility (WCAG)"
      ],
      "allowOther": true
    },
    {
      "key": "storeAccounts",
      "type": "select",
      "label": "Store developer accounts",
      "options": [
        "Client's own accounts",
        "Our accounts (transferred later)",
        "Not needed (web only)"
      ]
    },
    {
      "key": "distribution",
      "type": "multiselect",
      "label": "Distribution",
      "options": [
        "Apple App Store",
        "Google Play",
        "TestFlight (beta)",
        "Web",
        "Private / enterprise (MDM)",
        "APK direct download"
      ],
      "allowOther": true
    },
    {
      "key": "support",
      "type": "select",
      "label": "Support after launch",
      "options": [
        "None",
        "Bug fixes (30 days)",
        "Monthly maintenance plan",
        "Full support & updates"
      ]
    },
    {
      "key": "research",
      "type": "yesno",
      "label": "Research competition"
    },
    {
      "key": "mockups",
      "type": "yesno",
      "label": "Design mock-ups"
    },
    {
      "key": "mockupApproval",
      "type": "yesno",
      "label": "Mock-up approval",
      "showIf": {
        "op": "yes",
        "field": "mockups"
      }
    },
    {
      "key": "approvalBy",
      "type": "text",
      "label": "Approval by",
      "showIf": {
        "op": "yes",
        "field": "mockupApproval"
      }
    }
  ],
  "STORE": [
    {
      "key": "domainSetup",
      "type": "yesno",
      "label": "Domain setup"
    },
    {
      "key": "registrar",
      "type": "text",
      "label": "Registrar",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "dnsProvider",
      "type": "text",
      "label": "DNS Provider",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "app",
      "type": "select",
      "label": "Store platform",
      "options": [
        "Shopify",
        "WooCommerce",
        "Systeme.io",
        "ClickFunnels",
        "Squarespace",
        "Wix"
      ],
      "allowOther": true
    },
    {
      "key": "products",
      "type": "number",
      "label": "Number of products"
    },
    {
      "app": true,
      "key": "payments",
      "type": "multiselect",
      "label": "Payment gateways",
      "options": [
        "Stripe",
        "PayPal",
        "Square"
      ],
      "allowOther": true
    },
    {
      "key": "shipping",
      "type": "yesno",
      "label": "Shipping setup"
    },
    {
      "key": "taxes",
      "type": "yesno",
      "label": "Tax setup"
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    }
  ],
  "WEBSITE": [
    {
      "key": "domainSetup",
      "type": "yesno",
      "label": "Domain setup"
    },
    {
      "key": "registrar",
      "type": "text",
      "label": "Registrar",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "dnsProvider",
      "type": "text",
      "label": "DNS Provider",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "appSetup",
      "type": "yesno",
      "label": "App setup"
    },
    {
      "key": "app",
      "type": "select",
      "label": "App to use",
      "showIf": {
        "op": "yes",
        "field": "appSetup"
      },
      "options": [
        "Systeme.io",
        "ClickFunnels",
        "GoHighLevel",
        "GoDaddy",
        "WordPress"
      ]
    },
    {
      "key": "research",
      "type": "yesno",
      "label": "Research competition"
    },
    {
      "key": "model",
      "type": "yesno",
      "label": "Mock-up"
    },
    {
      "key": "modelApproval",
      "type": "yesno",
      "label": "Mock-up approval",
      "showIf": {
        "op": "yes",
        "field": "model"
      },
      "keepSpace": true
    },
    {
      "key": "modelApprovalBy",
      "type": "text",
      "label": "Mock-up approval by",
      "showIf": {
        "op": "yes",
        "field": "modelApproval"
      },
      "keepSpace": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "key": "pages",
      "type": "multiselect",
      "label": "Pages",
      "options": [
        "Home Page",
        "Services Page",
        "Product Page",
        "About Page",
        "Contact Page",
        "Team Page"
      ],
      "allowOther": true
    },
    {
      "key": "forms",
      "type": "multiselect",
      "label": "Forms",
      "options": [
        "Opt-In Forms",
        "Meeting Form",
        "Contact Form"
      ],
      "allowOther": true
    }
  ],
  "FUNNEL": [
    {
      "key": "domainSetup",
      "type": "yesno",
      "label": "Domain / sub-domain setup"
    },
    {
      "key": "registrar",
      "type": "text",
      "label": "Registrar",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "dnsProvider",
      "type": "text",
      "label": "DNS Provider",
      "showIf": {
        "op": "yes",
        "field": "domainSetup"
      },
      "keepSpace": true
    },
    {
      "key": "appSetup",
      "type": "yesno",
      "label": "App setup"
    },
    {
      "key": "app",
      "type": "select",
      "label": "App to use",
      "showIf": {
        "op": "yes",
        "field": "appSetup"
      },
      "options": [
        "Systeme.io",
        "ClickFunnels",
        "GoHighLevel",
        "GoDaddy",
        "WordPress"
      ],
      "keepSpace": true
    },
    {
      "key": "research",
      "type": "yesno",
      "label": "Research competition"
    },
    {
      "key": "model",
      "type": "yesno",
      "label": "Mock-up"
    },
    {
      "key": "modelApproval",
      "type": "yesno",
      "label": "Mock-up approval",
      "showIf": {
        "op": "yes",
        "field": "model"
      },
      "keepSpace": true
    },
    {
      "key": "modelApprovalBy",
      "type": "text",
      "label": "Mock-up approval by",
      "showIf": {
        "op": "yes",
        "field": "modelApproval"
      },
      "keepSpace": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "key": "funnels",
      "type": "multiselect",
      "label": "Funnels",
      "options": [
        "Lead Funnel",
        "Call/Meeting Funnel",
        "Sales Funnel",
        "Webinar Funnel",
        "Bridge Funnel"
      ],
      "allowOther": true
    },
    {
      "key": "leadMagnetDescription",
      "type": "textarea",
      "label": "Lead magnet description"
    },
    {
      "key": "leadMagnetFile",
      "type": "url",
      "label": "Lead magnet file (link)"
    }
  ],
  "BLOG": [
    {
      "key": "app",
      "type": "select",
      "label": "Blog platform",
      "options": [
        "WordPress",
        "Systeme.io",
        "GoHighLevel",
        "ClickFunnels",
        "Wix",
        "Squarespace"
      ],
      "allowOther": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "key": "topics",
      "type": "multiselect",
      "label": "Topics / categories",
      "options": [],
      "allowOther": true
    },
    {
      "key": "articles",
      "type": "number",
      "label": "Number of articles to write"
    },
    {
      "key": "research",
      "type": "yesno",
      "label": "Keyword & competition research"
    },
    {
      "key": "seo",
      "type": "yesno",
      "label": "SEO optimization"
    },
    {
      "key": "optIn",
      "type": "yesno",
      "label": "Newsletter opt-in form on the blog"
    }
  ],
  "CRM_CUSTOMIZATION": [
    {
      "key": "crm",
      "type": "select",
      "label": "CRM",
      "options": [
        "AMO CRM",
        "Systeme.io",
        "GoHighLevel",
        "HubSpot",
        "Zoho",
        "Pipedrive",
        "ClickFunnels"
      ],
      "allowOther": true
    },
    {
      "key": "importContacts",
      "type": "yesno",
      "label": "Import existing contacts"
    },
    {
      "key": "customFields",
      "type": "yesno",
      "label": "Custom fields"
    },
    {
      "key": "pipelines",
      "type": "yesno",
      "label": "Pipelines / stages"
    },
    {
      "key": "automations",
      "type": "yesno",
      "label": "Automations"
    },
    {
      "app": true,
      "key": "integrations",
      "type": "multiselect",
      "label": "Integrations",
      "options": [
        "Email",
        "Calendar",
        "SMS",
        "Forms",
        "Payments",
        "Accounting"
      ],
      "allowOther": true
    }
  ],
  "POST_AUTOMATION": [
    {
      "app": true,
      "key": "platforms",
      "type": "multiselect",
      "label": "Platforms",
      "options": [
        "Facebook",
        "Instagram",
        "LinkedIn",
        "TikTok",
        "X",
        "YouTube"
      ],
      "allowOther": true
    },
    {
      "key": "tool",
      "type": "multiselect",
      "label": "Automation tools",
      "options": [
        "Buffer",
        "Make",
        "Zapier",
        "Hootsuite",
        "Later",
        "Metricool",
        "n8n"
      ],
      "allowOther": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "of": "platforms",
      "key": "postsPerWeek",
      "type": "counts",
      "label": "Posts per week"
    },
    {
      "key": "contentSource",
      "type": "select",
      "label": "Who creates the content",
      "options": [
        "Client provides it",
        "We create it",
        "AI-assisted"
      ]
    }
  ],
  "AUTOMATION": [
    {
      "key": "tool",
      "type": "multiselect",
      "label": "Automation tools",
      "options": [
        "Make",
        "Zapier",
        "n8n",
        "Systeme.io",
        "GoHighLevel"
      ],
      "allowOther": true
    },
    {
      "key": "complexity",
      "type": "select",
      "label": "Complexity",
      "options": [
        "Simple",
        "Standard",
        "Advanced"
      ]
    },
    {
      "key": "apps",
      "type": "multiselect",
      "label": "Apps to connect",
      "options": [],
      "allowOther": true
    },
    {
      "key": "workflows",
      "type": "multiselect",
      "label": "Workflows to build",
      "options": [],
      "allowOther": true
    },
    {
      "key": "documentation",
      "type": "yesno",
      "label": "Documentation"
    }
  ],
  "AFFILIATE_MARKETING": [
    {
      "key": "programs",
      "type": "multiselect",
      "label": "Affiliate programs",
      "options": [],
      "allowOther": true
    },
    {
      "app": true,
      "key": "platforms",
      "type": "multiselect",
      "label": "Promotion platforms",
      "options": [
        "Facebook",
        "Instagram",
        "LinkedIn",
        "TikTok",
        "X",
        "YouTube"
      ],
      "allowOther": true
    },
    {
      "key": "languages",
      "type": "languages",
      "label": "Languages",
      "allowOther": true
    },
    {
      "key": "leadMagnet",
      "type": "yesno",
      "label": "Lead magnet"
    },
    {
      "key": "bridgePage",
      "type": "yesno",
      "label": "Bridge / review page"
    },
    {
      "key": "emailSequence",
      "type": "yesno",
      "label": "Email follow-up sequence"
    },
    {
      "key": "tracking",
      "type": "yesno",
      "label": "Tracking links"
    }
  ]
} as unknown as Record<string, FieldTpl[]>;
