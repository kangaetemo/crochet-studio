# İlmek Atölyesi

Tarayıcıda çalışan, Türkçe amigurumi tarif editörü. Tarif metninden tur başına kullanılan ve üretilen ilmekleri hesaplar, şekli döndürülebilir bir 3B önizlemede gösterir.

- İngilizce ve Türkçe yazımlar, tur aralıkları ve gruplu tekrarlar.
- Tireli kısa notları, ilmekten sonra yazılan miktarları ve sonda bırakılan toplamları okur. Yalnız sayı verilen turlardaki ilmek dağılımı önizleme için tahmindir.
- sc, inc, dec, hdc, dc, slst, bob, FLO, BLO, hdc inc, hdc dec, dc inc ve dc dec.
- Bir turu seçip rengini değiştir, örgü modunda tamamlanan turları işaretle.
- Açık taslak, renkler ve örgü ilerlemesi tarayıcının saklama alanında tutulur. TXT dışa aktarımı tarif metnini içerir.

## Çalıştırma

GitHub Pages ile yayınlarken kaynak olarak `main` dalının `/docs` klasörünü seç.

docs/ klasörünü herhangi bir statik web sunucusuyla sun. Paket kurulumu ve derleme gerekmiyor. Yerel geliştirmede örneğin Python ile `python -m http.server 8000 --directory docs` kullanılabilir.

## Testler

`node --test pattern.test.mjs`

3B önizleme şu anda tur bazlı, yaklaşık bir şekil gösterir. İlk sürüm tek parçalı tariflere odaklanır.
