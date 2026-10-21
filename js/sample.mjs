/** Made-up animals for the on-phone sample. Not the real herd. */
export function sampleBook() {
  const at = "2026-10-12T08:00:00.000Z";
  const cattle = [
    animal("sample-1842", "1842", "cow", "Angus", "Sample Farm", "North Camp", "2019-03-12", at),
    animal("sample-1108", "1108", "cow", "Bonsmara", "Sample Farm", "North Camp", "2018-06-04", at),
    animal("sample-2419", "2419", "heifer", "Angus", "Sample Farm", "North Camp", "2026-10-12", at, {
      motherId: "sample-1842",
      notes: "Calf of 1842",
    }),
    animal("sample-0771", "0771", "bull", "Angus", "Sandveld", "Hill", "2017-01-02", at),
    animal("sample-0966", "0966", "steer", "Bonsmara", "Palmyra", "River", "2024-09-19", at),
    animal("sample-1533", "1533", "heifer", "Angus", "Palmyra", "River", "2024-11-08", at),
    animal("sample-2204", "2204", "cow", "Brahman", "Sandveld", "Dam", "2020-05-30", at),
    animal("sample-0644", "0644", "cow", "Angus", "Palmyra", "Windmill", "2016-02-15", at),
  ];
  return {
    app: "Cattle Logbook",
    version: 1,
    practiceSample: true,
    cattle,
    events: [
      {
        id: "sample-ev-calving",
        cattleId: "sample-1842",
        date: "2026-10-12",
        type: "calving",
        value: null,
        details: "Calf 2419 added to herd",
        calfId: "sample-2419",
        calfTag: "2419",
        calfSex: "heifer",
        createdAt: at,
        updatedAt: at,
      },
      {
        id: "sample-ev-treatment",
        cattleId: "sample-1108",
        date: "2026-10-11",
        type: "treatment",
        value: null,
        details: "Long-acting antibiotic",
        createdAt: at,
        updatedAt: at,
      },
      {
        id: "sample-ev-move",
        cattleId: "sample-0966",
        date: "2026-10-10",
        type: "movement",
        value: null,
        details: "Moved from Sandveld · Dam to Palmyra · River",
        fromFarm: "Sandveld",
        toFarm: "Palmyra",
        fromPaddock: "Dam",
        toPaddock: "River",
        createdAt: at,
        updatedAt: at,
      },
    ],
    map: { view: null, paddocks: [] },
    botChangeLog: [],
    paddockCounts: [],
    updatedAt: at,
  };
}

function animal(id, tag, sex, breed, farm, paddock, dob, at, extra = {}) {
  return {
    id,
    tag,
    sex,
    breed,
    farm,
    paddock,
    dob,
    status: "active",
    deathDate: "",
    motherId: "",
    notes: "",
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}
