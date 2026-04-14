
// Master Category Dictionary
// This file stores the category mapping and brand detection logic.
// You can expand this dictionary as needed.

const MASTER_CATEGORIES = {
    "Power Tools": {
        "Drills": ["drill", "hammer drill", "impact driver"],
        "Saws": ["circular saw", "jigsaw", "reciprocating saw"],
        "Sanders": ["sander", "orbital sander", "belt sander"],
        "Grinders": ["angle grinder", "bench grinder"],
    },
    "Hand Tools": {
        "Hammers": ["hammer", "mallet", "sledgehammer"],
        "Screwdrivers": ["screwdriver", "driver set"],
        "Wrenches": ["wrench", "spanner", "socket set"],
        "Pliers": ["pliers", "wire stripper"],
    },
    "Construction Materials": {
        "Concrete": ["cement", "concrete mix", "mortar"],
        "Adhesives": ["glue", "adhesive", "epoxy", "sealant"],
        "Waterproofing": ["waterproofing", "membrane", "bitumen"],
    },
    "Cleaning Equipment": {
        "Pressure Washers": ["pressure washer", "high pressure cleaner"],
        "Vacuums": ["vacuum cleaner", "wet and dry vacuum"],
        "Steam Cleaners": ["steam cleaner"],
    },
    "Safety Gear": {
        "Helmets": ["helmet", "hardhat", "safety hat"],
        "Gloves": ["gloves", "safety gloves"],
        "Shoes": ["safety shoes", "boots", "work boots"],
    }
};

const MASTER_BRANDS = [
    "Bosch", "Makita", "DeWalt", "Stanley", "Black+Decker", "Karcher", 
    "Fosroc", "Sika", "Henkel", "Polybit", "Jotun", "Weber", "Mapei"
];

module.exports = {
    MASTER_CATEGORIES,
    MASTER_BRANDS
};
