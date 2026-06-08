// AUTO-GENERATED from the lev.charity admin tutorial export (tutorials.json).
// Each entry is one tutorial category and the admin pages it links to. The
// Automations page turns these into daily login-and-smoke checks: log in,
// visit each page, assert it loaded. Read-only navigation only — safe to run
// unattended every morning. Regenerate with:
//   node runner/scripts/gen-tutorial-automations.mjs <tutorials.json>
// Do not hand-edit; trim links from the Automations UI instead.

export const ADMIN_BASE = 'https://lev.charity';

// The tutorial hub itself — monitored daily so we catch newly published
// tutorials / sections (pair it with a visual baseline to flag changes).
export const TUTORIAL_HUB = { href: '/admin/tutorial', label: 'Tutorial hub' };

export const TUTORIAL_AUTOMATIONS = [
  {
    "slug": "onboarding-and-account-setup",
    "title": "Onboarding & Account Setup",
    "order": 1,
    "links": [
      {
        "label": "Organization Settings",
        "href": "/admin/settings/organization"
      },
      {
        "label": "Branding",
        "href": "/admin/settings/branding"
      },
      {
        "label": "User Management",
        "href": "/admin/users"
      }
    ]
  },
  {
    "slug": "dashboard",
    "title": "Dashboard",
    "order": 2,
    "links": [
      {
        "label": "Dashboard",
        "href": "/admin/dashboard"
      }
    ]
  },
  {
    "slug": "donation-forms",
    "title": "Donation Forms",
    "order": 3,
    "links": [
      {
        "label": "Donation Forms List",
        "href": "/admin/donation-forms"
      },
      {
        "label": "Create Donation Form",
        "href": "/admin/donation-forms/create"
      }
    ]
  },
  {
    "slug": "campaigns",
    "title": "Campaigns",
    "order": 4,
    "links": [
      {
        "label": "Campaign List",
        "href": "/admin/campaigns"
      },
      {
        "label": "Create Campaign",
        "href": "/admin/campaigns/create"
      }
    ]
  },
  {
    "slug": "transactions",
    "title": "Transactions",
    "order": 5,
    "links": [
      {
        "label": "All Transactions",
        "href": "/admin/transactions"
      },
      {
        "label": "Recurring Giving",
        "href": "/admin/transactions/recurring"
      },
      {
        "label": "Payment Links",
        "href": "/admin/transactions/payment-links"
      }
    ]
  },
  {
    "slug": "reports",
    "title": "Reports & Report Builder",
    "order": 6,
    "links": [
      {
        "label": "Reports",
        "href": "/admin/reports"
      },
      {
        "label": "Pre-Built Reports",
        "href": "/admin/reports?tab=pre-built"
      },
      {
        "label": "Report Builder",
        "href": "/admin/reports?tab=builder"
      },
      {
        "label": "Export history",
        "href": "/admin/reports?tab=history"
      }
    ]
  },
  {
    "slug": "admin-tools-and-settings",
    "title": "Admin Tools & Settings",
    "order": 7,
    "links": [
      {
        "label": "User Management",
        "href": "/admin/users"
      },
      {
        "label": "Roles & Permissions",
        "href": "/admin/roles"
      }
    ]
  },
  {
    "slug": "branding",
    "title": "Branding",
    "order": 8,
    "links": [
      {
        "label": "Branding Settings",
        "href": "/admin/settings/branding"
      },
      {
        "label": "Organization Settings",
        "href": "/admin/settings/organization"
      },
      {
        "label": "Header Templates",
        "href": "/admin/cms/templates/header"
      }
    ]
  },
  {
    "slug": "advanced-settings",
    "title": "Advanced Settings",
    "order": 9,
    "links": [
      {
        "label": "General Settings",
        "href": "/admin/settings/advanced/general"
      },
      {
        "label": "Checkout Settings",
        "href": "/admin/settings/advanced/checkout"
      },
      {
        "label": "Payment Settings",
        "href": "/admin/settings/advanced/payments"
      },
      {
        "label": "DAF (Control Center)",
        "href": "/admin/settings/control-center?tab=payment_gateways"
      },
      {
        "label": "Language & Timezone",
        "href": "/admin/settings/advanced/language-timezone"
      },
      {
        "label": "Registration",
        "href": "/admin/settings/advanced/registration"
      },
      {
        "label": "Integrations",
        "href": "/admin/settings/advanced/integrations"
      },
      {
        "label": "Offline Payments",
        "href": "/admin/settings/advanced/offline"
      },
      {
        "label": "CRM",
        "href": "/admin/settings/advanced/crm"
      },
      {
        "label": "Security",
        "href": "/admin/settings/advanced/security"
      },
      {
        "label": "Tribute",
        "href": "/admin/settings/advanced/tribute"
      }
    ]
  },
  {
    "slug": "notifications",
    "title": "Notification Preferences",
    "order": 10,
    "links": [
      {
        "label": "Notification Preferences",
        "href": "/admin/settings/notifications"
      }
    ]
  },
  {
    "slug": "profile",
    "title": "Profile",
    "order": 11,
    "links": [
      {
        "label": "My Profile",
        "href": "/profile"
      }
    ]
  },
  {
    "slug": "feedback-and-support",
    "title": "Feedback & Support",
    "order": 12,
    "links": [
      {
        "label": "Dashboard",
        "href": "/admin/dashboard"
      }
    ]
  },
  {
    "slug": "dynamic-elements",
    "title": "Dynamic Elements",
    "order": 13,
    "links": [
      {
        "label": "Sponsorships",
        "href": "/admin/dynamic-elements/sponsorships"
      },
      {
        "label": "Tribute Cards",
        "href": "/admin/dynamic-elements/tribute-cards"
      },
      {
        "label": "eCards",
        "href": "/admin/dynamic-elements/ecards"
      },
      {
        "label": "Custom Fields",
        "href": "/admin/custom-fields"
      }
    ]
  },
  {
    "slug": "custom-fields",
    "title": "Custom Fields",
    "order": 14,
    "links": [
      {
        "label": "Custom Fields",
        "href": "/admin/custom-fields"
      },
      {
        "label": "Create Custom Field",
        "href": "/admin/custom-fields/create"
      }
    ]
  },
  {
    "slug": "emails",
    "title": "Emails & transactional messages",
    "order": 15,
    "links": [
      {
        "label": "Emails",
        "href": "/admin/emails"
      },
      {
        "label": "Transactions",
        "href": "/admin/transactions"
      },
      {
        "label": "Email logs (Control Center)",
        "href": "/admin/settings/control-center/email-logs"
      }
    ]
  },
  {
    "slug": "payment-links",
    "title": "Payment Links",
    "order": 16,
    "links": [
      {
        "label": "Payment Links",
        "href": "/admin/payment-links"
      }
    ]
  },
  {
    "slug": "ecards-end-to-end",
    "title": "eCards: End-to-End Setup & Delivery",
    "order": 17,
    "links": [
      {
        "label": "eCards",
        "href": "/admin/dynamic-elements/ecards"
      },
      {
        "label": "Email Manager",
        "href": "/admin/emails"
      },
      {
        "label": "Control Center",
        "href": "/admin/settings/control-center"
      },
      {
        "label": "Pages",
        "href": "/admin/pages"
      }
    ]
  },
  {
    "slug": "receipts",
    "title": "Receipts & PDF regeneration",
    "order": 18,
    "links": [
      {
        "label": "Receipt Templates",
        "href": "/admin/dynamic-elements/receipts"
      },
      {
        "label": "Transactions",
        "href": "/admin/transactions"
      }
    ]
  },
  {
    "slug": "website-builder",
    "title": "Website Builder",
    "order": 19,
    "links": [
      {
        "label": "Pages",
        "href": "/admin/pages"
      },
      {
        "label": "Posts",
        "href": "/admin/posts"
      },
      {
        "label": "Components",
        "href": "/admin/cms/templates/headers-footers"
      },
      {
        "label": "Section Templates",
        "href": "/admin/cms/templates/sections"
      },
      {
        "label": "Media Library",
        "href": "/admin/media-library"
      },
      {
        "label": "Tags",
        "href": "/admin/cms/tags"
      },
      {
        "label": "Categories",
        "href": "/admin/cms/categories"
      }
    ]
  },
  {
    "slug": "posts",
    "title": "Posts (blog content)",
    "order": 20,
    "links": [
      {
        "label": "Posts",
        "href": "/admin/posts"
      }
    ]
  },
  {
    "slug": "widgets",
    "title": "Widgets",
    "order": 21,
    "links": [
      {
        "label": "Widgets",
        "href": "/admin/cms/widgets"
      },
      {
        "label": "Create widget",
        "href": "/admin/cms/widgets/create"
      }
    ]
  },
  {
    "slug": "media-library",
    "title": "Media Library",
    "order": 22,
    "links": [
      {
        "label": "Media Library",
        "href": "/admin/media-library"
      }
    ]
  },
  {
    "slug": "content-tags-and-categories",
    "title": "Content Tags & Categories",
    "order": 23,
    "links": [
      {
        "label": "Tags",
        "href": "/admin/cms/tags"
      },
      {
        "label": "Categories",
        "href": "/admin/cms/categories"
      }
    ]
  },
  {
    "slug": "campaign-urls-and-redirects",
    "title": "Campaign, team & participant URLs",
    "order": 24,
    "links": [
      {
        "label": "Campaign List",
        "href": "/admin/campaigns"
      },
      {
        "label": "Fundraisers",
        "href": "/admin/contacts/fundraisers"
      }
    ]
  },
  {
    "slug": "product-tags",
    "title": "Product Tags (Donation Forms & Campaigns)",
    "order": 25,
    "links": [
      {
        "label": "Donation Forms",
        "href": "/admin/donation-forms"
      },
      {
        "label": "Campaigns",
        "href": "/admin/campaigns"
      },
      {
        "label": "Report Builder",
        "href": "/admin/reports?tab=builder"
      }
    ]
  },
  {
    "slug": "control-center-logs",
    "title": "Control Center — Logs",
    "order": 26,
    "links": [
      {
        "label": "Email Logs (Control Center)",
        "href": "/admin/settings/control-center/email-logs"
      },
      {
        "label": "Receipt Logs (Control Center)",
        "href": "/admin/settings/control-center/receipt-logs"
      },
      {
        "label": "eCards Logs (Control Center)",
        "href": "/admin/settings/control-center/ecard-logs"
      },
      {
        "label": "Audit Logs (Control Center)",
        "href": "/admin/settings/control-center/audit-logs"
      }
    ]
  },
  {
    "slug": "control-center-accounts-connections",
    "title": "Control Center",
    "order": 27,
    "links": [
      {
        "label": "Control Center — Modules",
        "href": "/admin/settings/control-center?tab=modules"
      },
      {
        "label": "Control Center — Payment Gateways",
        "href": "/admin/settings/control-center?tab=payment_gateways"
      },
      {
        "label": "Control Center — Integrations",
        "href": "/admin/settings/control-center?tab=integrations"
      },
      {
        "label": "Control Center — Accounts & Connections",
        "href": "/admin/settings/control-center?tab=accounts_connections"
      }
    ]
  },
  {
    "slug": "contacts-advanced-search",
    "title": "Advanced contact search (Donors)",
    "order": 28,
    "links": [
      {
        "label": "Donors",
        "href": "/admin/contacts/donors"
      }
    ]
  },
  {
    "slug": "contacts-fundraisers-and-teams",
    "title": "Contacts: Fundraisers, teams & participant profiles",
    "order": 29,
    "links": [
      {
        "label": "Fundraisers",
        "href": "/admin/contacts/fundraisers"
      }
    ]
  },
  {
    "slug": "contacts",
    "title": "Contacts (CRM)",
    "order": 31,
    "links": [
      {
        "label": "Donors",
        "href": "/admin/contacts/donors"
      },
      {
        "label": "Insights",
        "href": "/admin/contacts/donors?view=insights"
      },
      {
        "label": "Households",
        "href": "/admin/contacts/households"
      },
      {
        "label": "Companies",
        "href": "/admin/contacts/companies"
      },
      {
        "label": "Duplicates",
        "href": "/admin/contacts/duplicates"
      }
    ]
  }
];
