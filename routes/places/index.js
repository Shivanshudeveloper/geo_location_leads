const express = require('express');
const axios = require('axios');
const router = express.Router();

// Replace with your actual API key
const apiKey = process.env.GOOGLE_PLACE_API_KEY;

// Function to get nearby places using the Places API Nearby Search with keyword
async function getNearbyPlaces(lat, lng, radius, keyword) {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?key=${apiKey}&location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}`;
    let places = [];
    let nextPageToken = null;

    do {
        if (nextPageToken) {
            // Delay required before using next_page_token
            await new Promise(resolve => setTimeout(resolve, 2000));
            url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?key=${apiKey}&pagetoken=${nextPageToken}`;
        }

        const response = await axios.get(url);
        const data = response.data;

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            throw new Error(`Error fetching places: ${data.status} - ${data.error_message || 'No error message provided'}`);
        }

        places = places.concat(data.results);
        nextPageToken = data.next_page_token;

    } while (nextPageToken);

    return places;
}

// Function to get detailed place information, including address components
async function getPlaceDetails(place_id) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?key=${apiKey}&place_id=${place_id}&fields=name,formatted_address,address_component`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.status !== 'OK') {
        throw new Error(`Error fetching place details: ${data.status} - ${data.error_message || 'No error message provided'}`);
    }

    return data.result;
}

// Function to extract address components
function extractAddressComponents(address_components) {
    let city = 'NA';
    let state = 'NA';
    let country = 'NA';
    let pincode = 'NA';

    address_components.forEach(component => {
        if (component.types.includes('locality')) {
            city = component.long_name;
        } else if (component.types.includes('administrative_area_level_1')) {
            state = component.long_name;
        } else if (component.types.includes('country')) {
            country = component.long_name;
        } else if (component.types.includes('postal_code')) {
            pincode = component.long_name;
        }
    });

    return { city, state, country, pincode };
}

// API endpoint to search places (POST)
router.post('/search', async (req, res) => {
    try {
        // Get parameters from request body
        const { lat, lng, radius, keyword } = req.body;

        // Validate required parameters
        if (!lat || !lng || !radius || !keyword) {
            return res.status(400).json({
                error: 'Missing required parameters. Please provide lat, lng, radius, and keyword.'
            });
        }

        // Validate parameter types
        if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
            return res.status(400).json({
                error: 'Invalid parameter types. lat, lng, and radius must be numbers.'
            });
        }

        const places = await getNearbyPlaces(lat, lng, radius, keyword);
        
        if (places.length === 0) {
            return res.json({
                message: 'No results found for the given keyword and location.',
                results: []
            });
        }

        const resultsArray = [];

        for (let place of places) {
            const details = await getPlaceDetails(place.place_id);
            const { city, state, country, pincode } = extractAddressComponents(details.address_components || []);

            const resultObject = {
                Name: details.name || 'NA',
                Address: details.formatted_address || 'NA',
                City: city,
                State: state,
                Country: country,
                Pincode: pincode,
            };

            resultsArray.push(resultObject);
        }

        res.json({
            message: 'Success',
            results: resultsArray
        });

    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

module.exports = router;