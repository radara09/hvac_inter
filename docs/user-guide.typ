// #set heading(numbering: "1.1)")

#set page(
  paper: "a4",
  margin: (top: 2.54cm, bottom: 2.54cm, left: 3.18cm, right: 3.18cm),
)
#set text(
  font: "Times New Roman",
  size: 12pt,
  weight: "regular",
  lang: "id",
)
#set par(first-line-indent: (amount: 2em, all: true), leading: 1.2em)

#align(center + horizon)[

  #text(size: 16pt, weight: "bold")[
    User Guide Form Laporan AC
  ]

  #v(1em)

  #text(size: 12pt)[Disusun sebagai dokumen untuk pengguna]

  #v(12em)

  #figure(
    image("logo.png", width: 25em),
  )
  #v(12em)


  #v(6em)

  *BANDUNG* \
  *2025*
]

#pagebreak()

#outline(title: "DAFTAR ISI", indent: auto)
\ \ \ \ \ \
#align(center)[
  = TUJUAN PANDUAN
]

Panduan ini ditujukan bagi USER (manajemen, staff, atau PIC lokasi) untuk melihat kondisi unit AC, memantau status servis, dan membaca laporan tanpa melakukan perubahan data teknis.

#pagebreak()
#align(center)[
  = LOGIN PENGGUNA
]

#figure(
  image("media/image1.png"),
  caption: [Halaman Login Dashboard Report AC],
) <login>

Langkah login sebagai User:
+ Buka website Dashboard Report AC.
+ Masukkan Username dan Password User.
+ Klik tombol 'Masuk ke Dashboard'.
+ Pastikan berhasil masuk ke Dashboard Utama.

Selain menggunakan username dan password, dapat login dengan akun Google dengan melakukan klik tombol Masuk dengan Google.

#figure(
  image("media/image14.png", width: 8cm),
  caption: [Tombol login dengan akun Google dan tombol ke halaman pendaftaran],
) <login:google>

Jika belum memiliki akun, silahkan klik tombol *#underline("Daftar")*.

#pagebreak()
#align(center)[
  = DAFTAR PENGGUNA
]

#figure(
  image("media/image2.png"),
  caption: [Halaman Pendaftaran Akun Dashboard Report AC],
) <register>

Ikuti langkah berikut untuk membuat akun.

+ Buka website Dashboard Report AC.
+ Pada halaman Login, klik tombol “Daftar”.
+ Website akan menampilkan Halaman Pendaftaran Akun.
+ Isi data pendaftaran sebagai berikut:
  - Email
  Masukkan alamat email aktif pengguna (contoh: pegawai\@rsud.id).
  - Username
  Masukkan username yang akan digunakan untuk login (contoh: Cahyadi).
  - Password
  Masukkan password dengan ketentuan *minimal 8 karakter*
  - Nama Lengkap (opsional)
  Masukkan nama lengkap pengguna (contoh: Cahyadi Setiawan).
+ Pastikan seluruh data telah diisi dengan benar.
+ Klik tombol “Daftar Akun Baru”.
+ Nanti akan langsung diarahkan ke Dashboard

\ \ \

#align(center)[
  == LOGOUT PENGGUNA
]

Jika pengguna ingin keluar dari akun setelah login atau daftar, terdapat tombol di sebelah kanan atas website.

#figure(
  image("media/image13.png"),
  caption: [Tombol logout pengguna],
) <register>

#pagebreak()
#align(center)[
  = MEMAHAMI DASHBOARD
]

Kondisi di bawah berikut merupakan user belum di-_assign_ oleh admin ke salah satu site.
#figure(
  image("media/image3.png"),
  caption: [Halaman Dashboard Utama - Belum di-_assign_ Site oleh Admin],
) <dashboard:unsigned>

Dashboard Utama merupakan halaman utama yang pertama kali ditampilkan setelah user berhasil login dan di-_assign_ site oleh admin. Halaman ini memberikan beberapa status kondisi seluruh unit AC yang terdaftar pada site yang telah di-_assign_.

#figure(
  image("media/image4.png"),
  caption: [Halaman Dashboard Utama - Sudah di-_assign_ Site oleh Admin],
) <dashboard:assigned>


== Komponen Informasi Dashboard
=== Total AC
Menampilkan jumlah keseluruhan unit AC yang terdaftar.
Fungsi: Mengetahui total aset AC yang dipantau oleh sistem.
=== +3 Bulan Belum Diservis
Menampilkan jumlah unit AC yang belum diservis lebih dari 3 bulan.
Fungsi: Indikator unit yang perlu perhatian dan penjadwalan servis.
=== Bermasalah
Menampilkan unit AC dengan status bermasalah.
Fungsi: Menjadi prioritas perhatian bagi user dan admin.
=== Pembaruan Terakhir
Menampilkan update terbaru dari teknisi.
Fungsi: Memastikan data yang ditampilkan merupakan data terkini.

=== Search Bar dan Scan QR Code
Untuk mencari unit AC dengan mengetik atau dengan scan QR Code dengan kamera.
#grid(
  columns: (auto, auto),
  gutter: 2em,
  image("media/dashboard:search.png"), image("media/dashboard:scanqr.png"),
)
#grid(
  columns: (auto, auto),
  gutter: 2em,
  [
    === Site dan Show QR
    Menampilkan site terkini. Show QR bisa menampilkan QR Code dari AC tersebut.
    #figure(image("media/dashboard:showqr.png", width: 7cm))
  ],
  [
    #image("media/dashboard:qrlatest.png", height: 6cm)
  ],
)

#pagebreak()
#align(center)[
  = MENCARI UNIT AC
]

#figure(
  image("media/image5.png"),
  caption: [Fitur Search Unit AC],
) <search:page>


Langkah-langkah:
- Gunakan kolom Search di Dashboard atau scan QR Code.
- Masukkan kode AC atau scan QR Code.
#grid(
  columns: (auto, auto),
  gutter: 2em,
  figure(
    numbering: none,
    image("media/search:input.png", width: 8cm),
    caption: [Input kolom search, minimal 3 karakter],
  ),
  figure(
    numbering: none,
    image("media/search:scanqr.png", width: 3cm),
    caption: [Tombol scan QR Code],
  ),
)
- Website menampilkan unit yang sesuai, klik unit untuk melihat detail.

#figure(
  numbering: none,
  image("media/search:results.png", width: 8cm),
  caption: [Hasil Mencari Unit AC],
) <search:results>


#pagebreak()
#align(center)[
  = MELIHAT DETAIL UNIT AC
]

#figure(
  image("media/image8.png"),
  caption: [Halaman Detail Unit AC],
) <detail:page>

#pagebreak()

Di sebelah kiri halaman terdapat detail unit AC dari hasil halaman mencari.

Informasi yang ditampilkan meliputi:
- Identitas unit (kode, lokasi, merek).
- Kondisi terakhir unit.
- Riwayat servis dan jadwal berikutnya.
- Foto dokumentasi servis.
- Nama teknisi.

Terdapat tombol Show QR untuk menampilkan QR Code.
#grid(
  columns: (auto, auto),
  gutter: 2em,
  image("media/detail:details.png", width: 6cm),
  image("media/detail:showqr.png", width: 4cm),
)

Untuk memperbarui data unit AC, dapat mengisi formulir di sebelah kanan halaman.

#grid(
  columns: (auto, auto),
  gutter: 2em,
  [Isi formulir dengan:
    - Kondisi terakhir
    - Tekanan freon
    - Suhu keluar
    - Ampere kompresor
    - Kondisi filter
    - Service terakhir
    - Catatan
    - Foto unit AC
    - Tanda tangan pengisi formulir
  ],
  image("media/image9.png", height: 8cm),
)

Upload foto dapat klik tombol _browse_ untuk mengambil foto unit AC dan bagian _canvas_ dapat diisi dengan tanda tangan digital.

#text(size: 10pt)[
  #grid(
    columns: (auto, auto),
    gutter: 2em,
    figure(
      numbering: none,
      image("media/image10.png", width: 7cm),
      caption: [Upload foto dan tanda tangan belum diisi],
    ),
    figure(
      numbering: none,
      image("media/image11.png", width: 7cm),
      caption: [Upload foto dan tanda tangan setelah diisi],
    ),
  )
]

Pada bagian bawah website terdapat tanda tangan teknisi terakhir yang memperbarui formulir unit AC.
#figure(image("media/detail:lastdata.png", width: 12cm))

#pagebreak()

Jika ingin kembali ke halaman mencari unit AC, dapat klik tombol berikut.

#figure(
  image("media/image12.png", width: 10cm),
  caption: [Tombol kembali ke halaman Mencari Unit AC],
) <detail>
