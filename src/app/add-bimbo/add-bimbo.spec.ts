/* src/app/add-child-form/add-child-form.component.scss */

.add-child-form-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 80px); /* Tieni conto della navbar */
  padding: 20px;
  box-sizing: border-box;
  background-color: #f0f4f8; /* Un leggero sfondo */
  margin-top: 80px; /* Sposta sotto la navbar */
}

h2 {
  font-family: 'Poetsen One', sans-serif;
  color: #333;
  margin-bottom: 30px;
  font-size: 2em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
}

form {
  background: #ffffff;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 450px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px; /* Spazio tra i gruppi del form */
}

.form-group {
  width: 100%;
  display: flex;
  flex-direction: column;
}

label {
  font-family: 'Poetsen One', sans-serif;
  margin-bottom: 8px;
  color: #555;
  font-size: 1.1em;
}

input[type="text"],
input[type="password"] {
  padding: 12px 15px;
  border: 1px solid #ddd;
  border-radius: 10px;
  font-size: 1em;
  font-family: 'Roboto', sans-serif; /* Un font più standard per gli input */
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

input[type="text"]:focus,
input[type="password"]:focus {
  border-color: #59b379;
  box-shadow: 0 0 0 3px rgba(89, 179, 121, 0.2);
  outline: none;
}

.add-button {
  background-color: #59b379;
  color: white;
  padding: 12px 25px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1.1em;
  font-family: 'Poetsen One', sans-serif;
  margin-top: 20px;
  transition: background-color 0.3s ease, transform 0.2s ease;
  align-self: center; /* Centra il bottone nel form */
  width: auto; /* Adatta la larghezza al contenuto */
  min-width: 120px; /* Larghezza minima per il bottone */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.add-button:hover {
  background-color: #45a049;
  transform: translateY(-2px);
}

.add-button:active {
  transform: translateY(0);
}