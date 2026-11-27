# Discollection

L'appli compagnon de ta collection de vinyles : relie ton compte Discogs, note et commente chaque titre, récupère son BPM automatiquement, et prépare tes systèmes.

**En ligne :** https://delapotatoz.github.io/discollection/

## Ce qu'elle fait
- Range ta collection Discogs en bacs que tu feuillettes comme chez le disquaire.
- Sur chaque titre : note sur 5, ressenti, moments du set (ouverture, montée, pic, rewind, fin de soirée).
- BPM : recherche sur GetSongBPM, mesure au micro, analyse d'un enregistrement ou tempo tapé.
- Reconnaissance du titre qui tourne (facultatif, avec un jeton AudD).
- « Préparer un système » : filtre tes titres par tempo, note et moment, et liste les disques à sortir.

## Comptes et données
- Comptes et notes : Supabase (tables dans `supabase.sql`, chacun ne voit que ses données).
- Discogs : chaque utilisateur relie sa collection avec son jeton personnel pendant l'arrivée.
- BPM : la fonction `supabase/functions/bpm` interroge GetSongBPM avec la clé de l'appli, rangée dans les secrets Supabase (`GETSONGBPM_KEY`). Les utilisateurs n'ont rien à saisir.
- AudD (facultatif) : un jeton dans le Profil pour reconnaître le titre qui tourne.

Tempo et tonalité fournis par [GetSongBPM.com](https://getsongbpm.com). Collection et pochettes via Discogs.
