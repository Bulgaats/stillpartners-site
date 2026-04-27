export type PublicLanguage = "en" | "mn";

export const publicLanguageCookie = "still_partners_lang";

export const publicLanguages: PublicLanguage[] = ["en", "mn"];

export function normalizePublicLanguage(value?: string | null): PublicLanguage {
  return value === "mn" ? "mn" : "en";
}

export const publicMessages = {
  en: {
    nav: {
      about: "About",
      subcontractors: "Subcontractors",
      clients: "Clients",
      contact: "Contact",
      internalBeta: "Internal Beta",
      languageLabel: "Language"
    },
    footer: {
      description:
        "Perth-based construction labour hire for main contractors needing dependable steelfixing, carpentry, and site-ready subcontractor support.",
      publicSite: "Public site",
      requestLabour: "Request Labour",
      joinContractor: "Join as Contractor",
      contact: "Contact",
      location: "Perth, Western Australia",
      copyright:
        "Still Partners Pty Ltd. Perth, Western Australia construction labour hire."
    },
    home: {
      eyebrow: "Perth WA Construction Labour Hire",
      heroTitle: "Reliable Steelfixing Labour Across WA",
      heroCopy:
        "Still Partners Pty Ltd supplies subcontracted steelfixers, carpenters, and construction labour for main contractors who need dependable crews, clear site coordination, and quality work.",
      requestLabour: "Request Labour",
      joinContractor: "Join as Contractor",
      builtForSite: "Built for site delivery",
      heroCards: ["Steelfixing crews", "Carpentry support", "Subcontractor workforce"],
      widerWa: "Perth and wider WA project support.",
      aboutEyebrow: "Still Partners Pty Ltd",
      aboutTitle: "Perth-based labour support for commercial construction.",
      aboutCopy:
        "We help main contractors keep projects moving with reliable subcontracted construction workers. Our focus is practical: site-ready people, safety-aware work habits, clear communication, and flexible workforce support when project demand changes.",
      trustBadges: ["Perth based", "Site ready", "Safety aware"],
      servicesEyebrow: "Services",
      servicesTitle: "Construction workforce support",
      services: [
        ["Steelfixing Labour", "Site-ready steelfixers for reinforcement, tying, placement support, and crew coverage."],
        ["Reinforcement Solutions", "Flexible labour support for reo packages, slab works, columns, walls, and project peaks."],
        ["Project Support", "Construction workers who can support site supervisors with practical daily labour needs."],
        ["Labour Hire for Construction", "Subcontracted workforce support for commercial builders and main contractors across Perth."]
      ],
      whyEyebrow: "Why choose us",
      whyTitle: "Serious site support with a flexible subcontractor workforce.",
      reasons: ["Safety First", "Reliable Team", "On Time", "Flexible Workforce", "Quality Workmanship"],
      projectEyebrow: "Project highlights",
      projectTitle: "Visual proof for serious construction sites.",
      projectHighlights: [
        {
          title: "Commercial reinforcement",
          copy: "Steelfixing labour support for active reo packages, slab preparation, walls, columns, and programme pressure."
        },
        {
          title: "Site-ready workforce",
          copy: "Reliable workers prepared for daily site expectations, inductions, start times, and supervisor coordination."
        },
        {
          title: "Perth project coverage",
          copy: "Flexible subcontractor support for Perth builders needing responsive labour across changing site conditions."
        }
      ],
      contractorTitle: "Skilled subcontractor?",
      contractorCopy:
        "Register your interest for Perth steelfixing, carpentry, and construction labour placements.",
      contactEyebrow: "Request labour",
      contactTitle: "Tell us what your site needs.",
      phone: "Phone:",
      email: "Email:",
      location: "Location:",
      bestFor: "Best for:",
      emailValue: "work@stillpartners.net",
      locationValue: "Perth, Western Australia",
      contactCaption:
        "For labour requests, contractor applications, and client enquiries, email work@stillpartners.net or use the form.",
      contactBestFor: "Labour requests, contractor applications, and client enquiries",
      clientFormButton: "Send labour request"
    },
    about: {
      eyebrow: "About us",
      title: "Practical construction labour support for Perth sites.",
      copy:
        "Still Partners Pty Ltd supplies subcontracted construction labour, including carpenters and steelfixers, to main contractors who need reliable crews, clear communication, and practical site administration.",
      focusTrades: "Focus trades",
      trades: [
        "Steelfixers for reinforcement works",
        "Carpenters for formwork and fit-out support",
        "Construction labourers for site tasks"
      ],
      cards: [
        ["Local coordination", "Perth-focused scheduling and communication for site teams."],
        ["Subcontractor records", "ABN, White Card, certificates, and onboarding details handled with clear administration."],
        ["Output tracking", "Work completion records help support cleaner site reporting and invoice preparation."]
      ],
      helpTitle: "How we help",
      helpCopy:
        "We help main contractors fill labour gaps with subcontracted workers who understand construction site expectations: arriving prepared, following site instructions, and recording completed work clearly.",
      cta: "Contact Still Partners"
    },
    client: {
      eyebrow: "For main contractors",
      title: "Request subcontracted workers for your Perth site.",
      copy:
        "Send the trades, site location, start date, and expected duration. We support commercial builders with steelfixers, carpenters, and construction labour.",
      includeTitle: "What to include",
      includeCopy:
        "Site address, start time, trade mix, estimated crew size, duration, and site contact details.",
      formNote:
        "This request is directed to work@stillpartners.net for Still Partners follow-up.",
      button: "Request labour support"
    },
    subcontractor: {
      eyebrow: "Subcontractor registration",
      title: "Register for Perth construction subcontracting work.",
      copy:
        "Tell us your trade, ABN, White Card status, and availability for steelfixing, carpentry, and site labour opportunities.",
      checklist: ["ABN and trade details", "White Card and certificates", "Perth site availability"],
      whiteCard: "I have a White Card",
      formNote:
        "Contractor applications are directed to work@stillpartners.net for review.",
      button: "Register interest"
    },
    contact: {
      eyebrow: "Contact",
      title: "Contact Still Partners",
      copy:
        "Send a message about labour availability, subcontractor onboarding, or an upcoming Perth construction site.",
      serviceArea: "Service area:",
      serviceAreaValue: "Perth, Western Australia",
      caption:
        "For construction labour, steelfixing support, and subcontractor onboarding, contact work@stillpartners.net.",
      formNote:
        "Messages submitted here are directed to work@stillpartners.net.",
      button: "Send message"
    },
    forms: {
      companyName: "Company name",
      contactName: "Contact name",
      fullName: "Full name",
      name: "Name",
      email: "Email",
      phone: "Phone",
      requiredTrades: "Required trades",
      projectLocation: "Project location",
      message: "Message",
      trade: "Trade",
      abn: "ABN",
      availability: "Availability or message",
      subject: "Subject"
    },
    thanks: {
      title: "Message received",
      demo:
        "This local demo captured the form safely without Supabase. Configure Supabase before using the form for live enquiries.",
      live:
        "Still Partners has received your details. We will review the request and respond through the contact information provided.",
      back: "Back to site"
    }
  },
  mn: {
    nav: {
      about: "Бидний тухай",
      subcontractors: "Гүйцэтгэгчид",
      clients: "Захиалагчид",
      contact: "Холбоо барих",
      internalBeta: "Дотоод бета",
      languageLabel: "Хэл"
    },
    footer: {
      description:
        "Перт хотод төвтэй Still Partners нь үндсэн гүйцэтгэгчдэд найдвартай арматурчин, мужаан болон талбайд ажиллахад бэлэн туслан гүйцэтгэгч ажиллах хүч нийлүүлдэг.",
      publicSite: "Сайтын цэс",
      requestLabour: "Ажиллах хүч захиалах",
      joinContractor: "Гүйцэтгэгчээр бүртгүүлэх",
      contact: "Холбоо барих",
      location: "Перт, Баруун Австрали",
      copyright:
        "Still Partners Pty Ltd. Перт, Баруун Австралийн барилгын ажиллах хүчний үйлчилгээ."
    },
    home: {
      eyebrow: "Перт, WA барилгын ажиллах хүч",
      heroTitle: "WA даяар найдвартай арматурын ажиллах хүч",
      heroCopy:
        "Still Partners Pty Ltd нь үндсэн гүйцэтгэгчдэд арматурчин, мужаан болон барилгын туслан гүйцэтгэгч ажиллах хүч нийлүүлж, талбайн зохион байгуулалт, чанартай ажлыг тогтвортой дэмждэг.",
      requestLabour: "Ажиллах хүч захиалах",
      joinContractor: "Гүйцэтгэгчээр бүртгүүлэх",
      builtForSite: "Талбайн ажлын хэрэгцээнд",
      heroCards: ["Арматурын баг", "Мужааны дэмжлэг", "Туслан гүйцэтгэгч ажиллах хүч"],
      widerWa: "Перт болон WA-ийн төслүүдэд дэмжлэг үзүүлнэ.",
      aboutEyebrow: "Still Partners Pty Ltd",
      aboutTitle: "Пертэд төвтэй, арилжааны барилгын ажиллах хүчний дэмжлэг.",
      aboutCopy:
        "Бид үндсэн гүйцэтгэгчдийн төслийг тасралтгүй урагшлуулахад туслах найдвартай туслан гүйцэтгэгч ажиллах хүчээр хангадаг. Манай арга барил энгийн: талбайд бэлэн хүмүүс, аюулгүй ажиллагаанд анхаарсан хандлага, тодорхой харилцаа, шаардлага өөрчлөгдөхөд уян хатан баг.",
      trustBadges: ["Пертэд төвтэй", "Талбайд бэлэн", "Аюулгүй ажиллагаа"],
      servicesEyebrow: "Үйлчилгээ",
      servicesTitle: "Барилгын ажиллах хүчний дэмжлэг",
      services: [
        ["Арматурын ажиллах хүч", "Арматур зангидах, байрлуулах, бэлтгэл болон багийн нэмэлт хэрэгцээнд талбайд бэлэн арматурчид."],
        ["Арматурын ажлын шийдэл", "Суурь, хавтан, багана, ханын арматур болон ажлын ачаалал нэмэгдэх үед уян хатан хүний нөөц."],
        ["Төслийн дэмжлэг", "Талбайн ахлагчийн өдөр тутмын хэрэгцээг дэмжих барилгын ажилчид."],
        ["Барилгын ажиллах хүч нийлүүлэлт", "Перт дэх арилжааны барилга болон үндсэн гүйцэтгэгчдэд туслан гүйцэтгэгч ажиллах хүчний дэмжлэг."]
      ],
      whyEyebrow: "Яагаад биднийг сонгох вэ",
      whyTitle: "Уян хатан туслан гүйцэтгэгч багтай, талбайн ажилд төвлөрсөн дэмжлэг.",
      reasons: ["Аюулгүй байдал", "Найдвартай баг", "Цаг баримтална", "Уян хатан хүч", "Чанартай гүйцэтгэл"],
      projectEyebrow: "Төслийн онцлох ажил",
      projectTitle: "Бодит барилгын талбайд нийцсэн найдвартай дэмжлэг.",
      projectHighlights: [
        {
          title: "Арилжааны арматурын ажил",
          copy: "Арматурын багц, суурь хавтан, хана, багана болон хугацааны шахалттай ажлуудад арматурчны дэмжлэг."
        },
        {
          title: "Талбайд бэлэн ажиллах хүч",
          copy: "Өдөр тутмын талбайн шаардлага, зааварчилгаа, эхлэх цаг болон ахлагчийн зохион байгуулалтад бэлэн ажилчид."
        },
        {
          title: "Перт дэх төслийн хамрах хүрээ",
          copy: "Талбайн нөхцөл, ажлын ачаалал өөрчлөгдөх үед Перт хотын барилгачдад уян хатан дэмжлэг үзүүлнэ."
        }
      ],
      contractorTitle: "Ур чадвартай туслан гүйцэтгэгч үү?",
      contractorCopy:
        "Перт дэх арматур, мужаан болон барилгын ажилд хамрагдах сонирхлоо бүртгүүлээрэй.",
      contactEyebrow: "Ажиллах хүч захиалах",
      contactTitle: "Танай талбайд ямар дэмжлэг хэрэгтэй вэ?",
      phone: "Утас:",
      email: "Имэйл:",
      location: "Байршил:",
      bestFor: "Зориулалт:",
      emailValue: "work@stillpartners.net",
      locationValue: "Перт, Баруун Австрали",
      contactCaption:
        "Ажиллах хүчний захиалга, гүйцэтгэгчийн бүртгэл болон захиалагчийн хүсэлтийг work@stillpartners.net хаягаар эсвэл маягтаар илгээнэ үү.",
      contactBestFor: "Ажиллах хүчний захиалга, гүйцэтгэгчийн бүртгэл, захиалагчийн хүсэлт",
      clientFormButton: "Хүсэлт илгээх"
    },
    about: {
      eyebrow: "Бидний тухай",
      title: "Перт дэх барилгын талбайд зориулсан практик ажиллах хүчний дэмжлэг.",
      copy:
        "Still Partners Pty Ltd нь үндсэн гүйцэтгэгчдэд арматурчин, мужаан болон барилгын туслан гүйцэтгэгч ажиллах хүч нийлүүлж, найдвартай баг, тодорхой харилцаа, талбайн зохион байгуулалтыг дэмждэг.",
      focusTrades: "Гол мэргэжлүүд",
      trades: [
        "Арматурын ажилд арматурчид",
        "Хэв хашмал болон мужааны дэмжлэг",
        "Талбайн өдөр тутмын ажилд барилгын ажилчид"
      ],
      cards: [
        ["Орон нутгийн зохицуулалт", "Перт дэх талбайн багуудтай хуваарь, харилцааг тодорхой зохицуулна."],
        ["Гүйцэтгэгчийн бүртгэл", "ABN, White Card, гэрчилгээ болон бүртгэлийн мэдээллийг цэгцтэй удирдана."],
        ["Гүйцэтгэлийн бүртгэл", "Ажлын гүйцэтгэлийн бүртгэл нь талбайн тайлан болон нэхэмжлэх бэлтгэлд тусална."]
      ],
      helpTitle: "Бид хэрхэн тусалдаг вэ",
      helpCopy:
        "Бид үндсэн гүйцэтгэгчдийн ажиллах хүчний дутагдлыг талбайн шаардлагыг ойлгодог туслан гүйцэтгэгч ажилчдаар нөхдөг: цагтаа ирэх, зааврыг дагах, хийсэн ажлаа тодорхой бүртгэх.",
      cta: "Still Partners-тэй холбогдох"
    },
    client: {
      eyebrow: "Үндсэн гүйцэтгэгчдэд",
      title: "Перт дэх талбайдаа туслан гүйцэтгэгч ажиллах хүч захиалах.",
      copy:
        "Шаардлагатай мэргэжил, талбайн байршил, эхлэх огноо болон хугацаагаа илгээнэ үү. Бид арилжааны барилгын компаниудад арматурчин, мужаан болон барилгын ажиллах хүчээр дэмжлэг үзүүлдэг.",
      includeTitle: "Юуг оруулах вэ",
      includeCopy:
        "Талбайн хаяг, эхлэх цаг, шаардлагатай мэргэжил, хүний тоо, хугацаа болон талбайн холбоо барих мэдээлэл.",
      formNote:
        "Энэ хүсэлт work@stillpartners.net хаяг руу чиглэж, Still Partners хариу холбогдоно.",
      button: "Ажиллах хүчний хүсэлт илгээх"
    },
    subcontractor: {
      eyebrow: "Туслан гүйцэтгэгчийн бүртгэл",
      title: "Перт дэх барилгын туслан гүйцэтгэгчийн ажилд бүртгүүлэх.",
      copy:
        "Өөрийн мэргэжил, ABN, White Card болон арматур, мужаан, талбайн ажил хийх боломжоо бидэнд илгээнэ үү.",
      checklist: ["ABN болон мэргэжлийн мэдээлэл", "White Card болон гэрчилгээ", "Перт дэх ажиллах боломж"],
      whiteCard: "Надад White Card байгаа",
      formNote:
        "Гүйцэтгэгчийн бүртгэлийн мэдээлэл work@stillpartners.net хаягаар хянагдана.",
      button: "Сонирхлоо бүртгүүлэх"
    },
    contact: {
      eyebrow: "Холбоо барих",
      title: "Still Partners-тэй холбогдох",
      copy:
        "Ажиллах хүчний боломж, туслан гүйцэтгэгчийн бүртгэл эсвэл Перт дэх удахгүй эхлэх барилгын талбайн талаар мессеж илгээнэ үү.",
      serviceArea: "Үйлчлэх бүс:",
      serviceAreaValue: "Перт, Баруун Австрали",
      caption:
        "Барилгын ажиллах хүч, арматурын дэмжлэг болон гүйцэтгэгчийн бүртгэлийн талаар work@stillpartners.net хаягаар холбогдоно уу.",
      formNote:
        "Энд илгээсэн мессеж work@stillpartners.net хаяг руу чиглэнэ.",
      button: "Мессеж илгээх"
    },
    forms: {
      companyName: "Компанийн нэр",
      contactName: "Холбоо барих хүний нэр",
      fullName: "Бүтэн нэр",
      name: "Нэр",
      email: "Имэйл",
      phone: "Утас",
      requiredTrades: "Шаардлагатай мэргэжил",
      projectLocation: "Төслийн байршил",
      message: "Мессеж",
      trade: "Мэргэжил",
      abn: "ABN",
      availability: "Ажиллах боломж эсвэл мессеж",
      subject: "Гарчиг"
    },
    thanks: {
      title: "Мессеж хүлээн авлаа",
      demo:
        "Орон нутгийн demo горимд таны маягтыг Supabase ашиглахгүйгээр аюулгүй хүлээн авлаа. Live хүсэлт авахын өмнө Supabase тохируулна уу.",
      live:
        "Still Partners таны мэдээллийг хүлээн авлаа. Бид хүсэлтийг шалгаад өгсөн холбоо барих мэдээллээр хариу өгнө.",
      back: "Сайт руу буцах"
    }
  }
} as const;

export type PublicMessages = typeof publicMessages.en;
