# 📚 Ordpedia Info Archive

This repository serves as an automated, public archive of all approved pages from [Ordpedia](https://www.ordpedia.com). It acts as a decentralized backup of Ordpedia's knowledge base, ensuring that this valuable information remains accessible to the community even if the main website experiences downtime.

## 🔄 How It Works

This repository automatically syncs with Ordpedia's content through a dedicated service that:

1. Monitors for newly approved pages and revisions on Ordpedia
2. Creates a new folder for each page using its slug as the folder name
3. Stores each approved revision as a markdown file (e.g., `revision-1.md`, `revision-2.md`, etc.)
4. Automatically updates when pages are renamed or new revisions are approved

## 📁 Repository Structure

```
ordpedia-info/
├── page-slug-1/
│   ├── revision-1.md
│   └── revision-2.md
├── page-slug-2/
│   └── revision-1.md
└── ...
```

Each folder represents a page from Ordpedia, and each markdown file within represents an approved revision of that page.

## 🤝 Contributing

This repository is automatically maintained by the Ordpedia system. The best way to contribute to this content is through the main [Ordpedia website](https://www.ordpedia.com), where you can:

1. Create new pages
2. Submit revisions to existing pages
3. Participate in the review process

Once your contributions are approved on Ordpedia, they will automatically be synced to this repository.

## 🔍 Finding Content

You can browse this repository's folders to find specific pages, or use GitHub's search functionality to find specific content across all pages.

## ⚠️ Important Note

This repository is meant to serve as a backup and reference. The authoritative source for Ordpedia content remains the main website at [ordpedia.com](https://www.ordpedia.com), where you can find the most up-to-date versions of pages along with the full feature set for interacting with the content.

## 📜 License

The content in this repository is maintained as a public resource for the Bitcoin and Ordinals community. Please refer to Ordpedia's terms of service for specific usage terms.

## 🔗 Links

- [Ordpedia Website](https://www.ordpedia.com)
- [Twitter](https://twitter.com/ordpedia)

---

*This repository is automatically maintained by the Ordpedia auto-poster system. Last updated: February 2024*
