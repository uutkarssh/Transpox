# बी.एड पाठ योजनाएँ — विज्ञान / जीव विज्ञान (Hindi Translation)

A fully responsive, modern HTML webpage containing the **complete Hindi translation** of **15 B.Ed Science/Biology Lesson Plans** (Lesson Plan 1 to 15).

## 📚 Contents

Each lesson plan includes the following sections (in Hindi with English terms in brackets):

1. **सामान्य उद्देश्य** (General Objectives)
2. **विशिष्ट उद्देश्य** (Specific Objectives)
3. **पूर्व ज्ञान** (Previous Knowledge)
4. **शिक्षण सहायक सामग्री** (Teaching Aids)
5. **प्रस्तावना** (Introduction) — Q&A table
6. **विषय का कथन** (Statement of Topic)
7. **प्रस्तुतीकरण** (Presentation) — 4-column table (Teaching Point | Teacher's Activity | Student's Activity | Blackboard Work)
8. **Hindi-labeled diagrams** (16 scientific illustrations)
9. **पुनरावृत्ति** (Recapitulation) — Q&A
10. **गृहकार्य** (Homework) — fill in the blanks, match the columns, tick the correct option

## 📖 Lesson Plans

| # | Topic (Hindi) | Topic (English) |
|---|---|---|
| 1 | पौधों में अलैंगिक जनन | Asexual Reproduction in Plants |
| 2 | जल प्रदूषण | Water Pollution |
| 3 | जल एवं जल चक्र | Water & Water Cycle |
| 4 | पौधों में पोषण | Nutrition in Plants |
| 5 | पाचन तंत्र | Digestive System |
| 6 | मानव नेत्र | Human Eye |
| 7 | सौर मंडल | Solar System |
| 8 | संतुलित आहार | Balanced Diet |
| 9 | कोशिकाओं का संगठन | Organization of Cells |
| 10 | ऊतक एवं इसके प्रकार | Tissue & its Types |
| 11 | सूक्ष्मजीव | Microorganism |
| 12 | मृदा | Soil |
| 13 | शरीर में गति | Body Movement |
| 14 | खाद्य परिरक्षण | Food Preservation |
| 15 | रेशे से वस्त्र तक | Fibre to Fabric |

## 🎨 Features

- **Fully responsive** — works on desktop, tablet, and mobile
- **Sticky header** with title and hamburger menu
- **Sidebar navigation** (desktop) / slide-in drawer (mobile) for quick jump to any lesson plan
- **Active link highlighting** — auto-updates as you scroll
- **Smooth scrolling** behavior
- **Back-to-top floating button**
- **Clean, modern card-based design** with pastel indigo/teal color palette
- **Hindi-labeled SVG-quality diagrams** for each scientific concept
- **Zebra-striped tables** with horizontal scroll on mobile
- **Print-friendly** CSS for offline printing
- **Self-contained** — no build step required

## 🔤 Fonts

- **Poppins** (Google Fonts) — for Latin text and UI
- **Noto Sans Devanagari** (Google Fonts) — for Hindi/Devanagari text rendering

Font stack: `'Poppins', 'Noto Sans Devanagari', sans-serif`

## 📁 File Structure

```
Transpox/
├── index.html              # Main HTML page with all 15 lesson plans
├── css/
│   └── style.css           # All styling (responsive, themes, layouts)
├── js/
│   └── script.js           # Sidebar toggle, smooth scroll, back-to-top, active link
├── diagrams/               # 16 Hindi-labeled PNG diagrams
│   ├── lp1_asexual_reproduction.png
│   ├── lp3_water_cycle.png
│   ├── lp4_photosynthesis_stomata.png
│   ├── lp4_pitcher_plant.png
│   ├── lp5_digestive_system.png
│   ├── lp5_amoeba_digestion.png
│   ├── lp6_human_eye.png
│   ├── lp7_solar_system.png
│   ├── lp8_balanced_diet.png
│   ├── lp9_cell.png
│   ├── lp10_tissue_types.png
│   ├── lp11_microorganism.png
│   ├── lp12_soil_layers.png
│   ├── lp13_bones_joints.png
│   ├── lp14_food_preservation.png
│   └── lp15_cotton.png
└── README.md               # This file
```

## 🚀 Usage

### Option 1: Open Directly
Just open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).

### Option 2: GitHub Pages
1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Select **Deploy from a branch** → **main** → **/(root)**
4. Your site will be live at `https://<username>.github.io/Transpox/`

### Option 3: Local Server
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

## 📱 Responsive Breakpoints

| Device | Width | Layout |
|---|---|---|
| Desktop | > 1024px | Two-column (sidebar + content) |
| Tablet | 768–1024px | Adjusted padding |
| Mobile | < 768px | Single column, slide-in drawer |
| Small mobile | < 480px | Compact font sizes |

## 🎯 Educational Purpose

This webpage is a **B.Ed (Bachelor of Education) assignment/project work** showcasing properly structured lesson plans for Science/Biology teaching. The Hindi translation uses standard B.Ed terminology and includes English scientific terms in brackets for clarity (e.g., प्रकाश संश्लेषण (Photosynthesis)).

## 📝 License

Free for educational use.
